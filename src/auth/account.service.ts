import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AccountTokenPurpose, Prisma } from '../../generated/prisma/client';
import { apiError, ErrorCode } from 'common/http/api-error';
import { hashSecret } from 'common/helpers/secrets';
import { queueEmail } from '../email/email-outbox';
import { passwordChangedEmail, passwordResetEmail } from '../email/templates';
import {
  newAccountToken,
  queueVerification,
  RESEND_COOLDOWN_MS,
} from './account-tokens';

const { EMAIL_VERIFICATION, PASSWORD_RESET } = AccountTokenPurpose;

/**
 * Email verification and password reset/change. Codes are single use and
 * stored hashed; anything that changes the password ends every session.
 */
@Injectable()
export class AccountService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private get appUrl() {
    return this.config.get<string>('APP_URL') || undefined;
  }

  async verifyEmail(code: string) {
    await this.prisma.$transaction(async (tx) => {
      const token = await this.claim(
        tx,
        code,
        EMAIL_VERIFICATION,
        ErrorCode.INVALID_VERIFICATION_TOKEN,
      );
      await tx.user.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: new Date() },
      });
    });
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.emailVerifiedAt)
      throw new ConflictException(
        apiError(
          ErrorCode.EMAIL_ALREADY_VERIFIED,
          'Email address is already verified',
        ),
      );
    if (await this.sentRecently(userId, EMAIL_VERIFICATION)) return;

    await this.prisma.$transaction((tx) =>
      queueVerification(tx, user, this.appUrl),
    );
  }

  // Answers the same whether or not the address has an account, so it can't
  // be used to find out who is registered.
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || (await this.sentRecently(user.id, PASSWORD_RESET))) return;

    const { action, data } = newAccountToken(
      PASSWORD_RESET,
      email,
      this.appUrl,
    );
    await this.prisma.$transaction(async (tx) => {
      // Only the newest code works.
      await tx.accountToken.deleteMany({
        where: { userId: user.id, purpose: PASSWORD_RESET, usedAt: null },
      });
      await tx.accountToken.create({ data: { userId: user.id, ...data } });
      await queueEmail(
        tx,
        user.id,
        user.email,
        passwordResetEmail(user.firstName, action),
      );
    });
  }

  async resetPassword(code: string, newPassword: string) {
    const passwordHash = await this.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      const token = await this.claim(
        tx,
        code,
        PASSWORD_RESET,
        ErrorCode.INVALID_RESET_TOKEN,
      );
      const user = await tx.user.findUniqueOrThrow({
        where: { id: token.userId },
      });
      await this.setPassword(tx, user, passwordHash, {
        // The code arrived in their inbox, which proves the address too.
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      });
    });
  }

  /**
   * Checks the current password, then sets the new one. The caller starts a
   * fresh session afterwards, since every existing one is revoked.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    // 400 rather than 401: the bearer token is fine, so clients mustn't
    // react by refreshing or logging out.
    if (!(await bcrypt.compare(currentPassword, user.passwordHash)))
      throw new BadRequestException(
        apiError(ErrorCode.INVALID_CREDENTIALS, 'Current password is wrong'),
      );

    const passwordHash = await this.hash(newPassword);
    await this.prisma.$transaction((tx) =>
      this.setPassword(tx, user, passwordHash),
    );
    return user;
  }

  // New password, every session revoked, unused reset codes dropped, and the
  // owner told by email.
  private async setPassword(
    tx: Prisma.TransactionClient,
    user: { id: string; email: string; firstName: string },
    passwordHash: string,
    extra: Prisma.UserUpdateInput = {},
  ) {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, ...extra },
    });
    await tx.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.accountToken.deleteMany({
      where: { userId: user.id, purpose: PASSWORD_RESET, usedAt: null },
    });
    await queueEmail(
      tx,
      user.id,
      user.email,
      passwordChangedEmail(user.firstName),
    );
  }

  // Marks a code used, atomically. It must be unused, unexpired, for this
  // purpose, and issued to the account's current address.
  private async claim(
    tx: Prisma.TransactionClient,
    code: string,
    purpose: AccountTokenPurpose,
    invalidCode: ErrorCode,
  ) {
    const invalid = () =>
      new BadRequestException(
        apiError(invalidCode, 'Code is invalid, expired or already used'),
      );
    const token = await tx.accountToken.findUnique({
      where: { tokenHash: hashSecret(code) },
      include: { user: { select: { email: true } } },
    });
    if (
      !token ||
      token.purpose !== purpose ||
      token.expiresAt <= new Date() ||
      token.email !== token.user.email
    )
      throw invalid();

    const { count } = await tx.accountToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (!count) throw invalid();
    return token;
  }

  private async sentRecently(userId: string, purpose: AccountTokenPurpose) {
    const recent = await this.prisma.accountToken.count({
      where: {
        userId,
        purpose,
        createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
      },
    });
    return recent > 0;
  }

  private hash(password: string) {
    return bcrypt.hash(
      password,
      Number(this.config.getOrThrow<string>('BCRYPT_SALT_ROUNDS')),
    );
  }
}
