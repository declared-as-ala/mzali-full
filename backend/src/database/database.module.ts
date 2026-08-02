import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CountersService } from './counters.service';
import { Counter, CounterSchema } from './counter.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        // Fail fast instead of buffering commands while disconnected
        serverSelectionTimeoutMS: 10_000,
      }),
    }),
    MongooseModule.forFeature([{ name: Counter.name, schema: CounterSchema }]),
  ],
  providers: [CountersService],
  exports: [CountersService, MongooseModule],
})
export class DatabaseModule {}
