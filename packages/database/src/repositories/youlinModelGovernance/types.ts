/** One administrator-maintained authorization row as read for a decision. */
export interface YoulinModelGrant {
  enabled: boolean;
  model: string;
  monthlyTokenLimit?: null | number;
  provider?: null | string;
}
