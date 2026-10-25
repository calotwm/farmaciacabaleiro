import { z } from "zod";

export { cancelDeliverySchema, createDeliverySchema, editDeliverySchema, rescheduleDeliverySchema } from "../application/delivery-input";

export const deliveryIdSchema = z.uuid();
