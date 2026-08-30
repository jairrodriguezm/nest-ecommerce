import { IsEnum } from "class-validator";
import { OrderStatus } from "../order.entity";

export class UpdateStatusDto {
    @IsEnum(OrderStatus, { message: `status must be one of: ${Object.values(OrderStatus).join(', ')}` })
    status: OrderStatus;
}