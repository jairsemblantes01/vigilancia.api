import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  const port = process.env.PORT || 4001;
  await app.listen(port);
  console.log(`🚀 Servidor de señalización corriendo en puerto ${port}`);
}
bootstrap();
