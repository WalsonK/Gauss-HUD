import { z } from 'zod';

/** This month's estimated vehicle API spend, compared with the provider's monthly credit. */
export const UsageSummarySchema = z.object({
  monthCost: z.number().nonnegative(),
  monthlyCredit: z.number().nonnegative(),
  currency: z.string().length(3),
});
export type UsageSummary = z.infer<typeof UsageSummarySchema>;
