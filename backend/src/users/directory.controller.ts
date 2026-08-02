import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';

/**
 * Matches the legacy /api/employees-directory route: any authenticated staff
 * member can resolve employee ids to display labels (no emails, no roles).
 */
@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
@UseGuards(JwtAuthGuard)
export class DirectoryController {
  constructor(private readonly users: UsersService) {}

  @Get('directory')
  directory() {
    return this.users.directory();
  }
}
