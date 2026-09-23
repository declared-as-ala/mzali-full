import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CurrentUser } from '@/auth/current-user.decorator';
import { JwtAuthGuard, RequestUser } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '@/auth/guards/permissions.guard';
import { PayrollService, toPayrollPaymentRecord } from './payroll.service';
import { toAttendanceEmployeeRecord } from './attendance.mapper';
import { renderPayslipPdf } from './payslip-pdf';
import { PAYMENT_METHODS } from './dto/attendance-employee.dto';

class CreatePaymentDto {
  @IsInt() @Min(0) hourlyRateMinor!: number;
  @IsOptional() @IsInt() @Min(0) bonusMinor?: number;
  @IsOptional() @IsInt() @Min(0) deductionMinor?: number;
  @IsIn(PAYMENT_METHODS) paymentMethod!: 'cash' | 'transfer' | 'other';
  @IsOptional() @IsString() note?: string;
}

@ApiTags('admin/payroll')
@ApiBearerAuth()
@Controller('admin/payroll')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayrollAdminController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('unpaid')
  @RequirePermissions('payroll.view')
  async unpaid() {
    return this.payroll.unpaidSummary();
  }

  @Get('summary')
  @RequirePermissions('payroll.view')
  async summary() {
    return this.payroll.summary();
  }

  @Post('employees/:id/pay')
  @RequirePermissions('payroll.pay')
  async pay(@Param('id') id: string, @Body() dto: CreatePaymentDto, @CurrentUser() user: RequestUser) {
    const doc = await this.payroll.createPayment(id, dto, { type: 'employee', id: user.userId, name: user.name });
    const employee = await this.payroll.getPayment(doc.id);
    return toPayrollPaymentRecord(doc, `${employee.employee.firstName} ${employee.employee.lastName}`);
  }

  @Get('payments')
  @RequirePermissions('payroll.view')
  async listPayments(@Query('employeeId') employeeId?: string, @Query('page') page?: string, @Query('perPage') perPage?: string) {
    return this.payroll.listPayments({ employeeId, page: page ? Number(page) : undefined, perPage: perPage ? Number(perPage) : undefined });
  }

  @Get('payments/:id')
  @RequirePermissions('payroll.view')
  async getPayment(@Param('id') id: string) {
    const { payment, employee } = await this.payroll.getPayment(id);
    return toPayrollPaymentRecord(payment, `${employee.firstName} ${employee.lastName}`);
  }

  @Get('payments/:id/pdf')
  @RequirePermissions('payroll.view')
  async pdf(@Param('id') id: string, @Query('download') download: string | undefined, @Res() res: Response) {
    const { payment, employee } = await this.payroll.getPayment(id);
    const record = toPayrollPaymentRecord(payment, `${employee.firstName} ${employee.lastName}`);
    const buffer = await renderPayslipPdf(record, toAttendanceEmployeeRecord(employee));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${payment.payrollNumber}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  }
}
