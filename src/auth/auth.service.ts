import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'
import * as bcrypt from 'bcryptjs'

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) { }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user) return null

    const matches = await bcrypt.compare(user.passwordHash, password)
    if (!matches) return null

    // eslint-disable-next-line
    const { passwordHash, ...safeUser } = user
    return safeUser
  }
}
