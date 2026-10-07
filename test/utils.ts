import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';

export const PASSWORD = 'password123';

// Calendar day `offset` days from today, as YYYY-MM-DD.
export const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// Boots the app exactly like main.ts does and empties the test database.
export async function createTestApp() {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app: INestApplication<App> = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);

  const [{ db }] = await prisma.$queryRaw<
    { db: string }[]
  >`SELECT current_database() AS db`;
  if (!db.endsWith('_test'))
    throw new Error(`Refusing to truncate non-test database "${db}"`);
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE itinerary_flight, itinerary_hotel, itineraries, flights, airports, hotels, destinations, users CASCADE',
  );

  const api = () => request(app.getHttpServer());

  // Registers a user (promoting to ADMIN directly in the DB) and returns a JWT.
  const signUp = async (email: string, role: 'USER' | 'ADMIN' = 'USER') => {
    await api()
      .post('/api/auth/register')
      .send({ email, password: PASSWORD, firstName: 'Test', lastName: 'User' })
      .expect(201);
    if (role === 'ADMIN')
      await prisma.user.update({ where: { email }, data: { role } });

    const res = await api()
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return (res.body as { data: { token: string } }).data.token;
  };

  return { app, prisma, api, signUp };
}
