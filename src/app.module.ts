import { Module } from '@nestjs/common';
import { SignalingGateway } from './signaling/signaling.gateway';
import { AppController } from './app.controller';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [SignalingGateway],
})
export class AppModule {}
