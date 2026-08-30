import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, Query, BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from './order.entity';
import { UpdateStatusDto } from './dto/update-status.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(@Query('userId') userId?: string) {
    if (userId) {
      const parsedId = parseInt(userId, 10);
      if (isNaN(parsedId)) {
        throw new BadRequestException('userId must be a valid number');
      }
      return this.ordersService.findByUser(parsedId);
    }
    return this.ordersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findOne(id);
  }

  @Get(':id/full')
  getFullDetails(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.getOrderWithFullDetails(id);
  }

  @Post()
  create(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.create(createOrderDto);
  }

  @Post(':id/pay')
  processPayment(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.processPayment(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateStatusDto: UpdateStatusDto,
  ) {
    return this.ordersService.updateStatus(id, updateStatusDto.status);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.cancel(id);
  }
}
