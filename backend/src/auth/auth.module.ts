import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { Employee, EmployeeSchema } from '@/users/employee.schema';
import { Session, SessionSchema } from './session.schema';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { ServiceTokenGuard } from './guards/service-token.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
    MongooseModule.forFeature([
      { name: Employee.name, schema: EmployeeSchema },
      { name: Session.name, schema: SessionSchema },
    ]),
  ],
  providers: [AuthService, JwtAuthGuard, PermissionsGuard, ServiceTokenGuard],
  exports: [AuthService, JwtAuthGuard, PermissionsGuard, ServiceTokenGuard, MongooseModule],
})
export class AuthModule {}
