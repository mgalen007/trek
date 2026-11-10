import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { JobsModule } from '../jobs/jobs.module';
import { EmailOutboxService } from './email-outbox.service';
import { LogMailer, Mailer, SmtpMailer } from './mailer';

// SMTP when SMTP_URL is set, otherwise emails are only logged.
// MAIL_TRANSPORT=log forces logging even with SMTP_URL (the e2e tests do).
const mailerFactory = (config: ConfigService): Mailer => {
  const smtpUrl = config.get<string>('SMTP_URL');
  if (smtpUrl && config.get<string>('MAIL_TRANSPORT') !== 'log')
    return new SmtpMailer(
      smtpUrl,
      config.get<string>('MAIL_FROM') ?? 'Trek <no-reply@trek.local>',
    );
  new Logger('Mailer').warn(
    'Emails are logged, not sent (SMTP_URL unset or MAIL_TRANSPORT=log)',
  );
  return new LogMailer();
};

@Module({
  imports: [PrismaModule, JobsModule],
  providers: [
    { provide: Mailer, inject: [ConfigService], useFactory: mailerFactory },
    EmailOutboxService,
  ],
  exports: [Mailer, EmailOutboxService],
})
export class EmailModule {}
