-- Preview #85: integrity-only financial adjustment checks.
-- READ-ONLY, no identifiers are returned. Compare before/after in a
-- controlled window; consistency here is NOT full business-rule parity.
-- Zero unmatched lines is necessary before approving the paginated CMP view.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH adjustments AS (
  SELECT
    count(*) AS adjustment_count,
    count(*) FILTER (
      WHERE original_cents - refund_cents <> remaining_cents
    ) AS cents_balance_mismatches,
    count(*) FILTER (
      WHERE original_cents IS NULL OR refund_cents IS NULL OR remaining_cents IS NULL
    ) AS missing_cents,
    count(*) FILTER (
      WHERE jsonb_typeof(line_adjustments) IS DISTINCT FROM 'array'
    ) AS non_array_lines,
    count(*) FILTER (
      WHERE refund_entries IS NOT NULL
        AND jsonb_typeof(refund_entries) IS DISTINCT FROM 'array'
    ) AS non_array_refunds,
    count(*) FILTER (
      WHERE NOT EXISTS (SELECT 1 FROM public.supply_purchases p WHERE p.id = a.purchase_id)
    ) AS missing_purchases,
    count(*) FILTER (
      WHERE NOT EXISTS (SELECT 1 FROM public.supply_purchase_orders o WHERE o.id = a.order_id)
    ) AS missing_orders,
    count(*) FILTER (
      WHERE NOT EXISTS (SELECT 1 FROM public.supply_purchase_payments p WHERE p.id = a.payment_id)
    ) AS missing_payments
  FROM public.supply_purchase_partial_adjustments a
),
lines AS (
  SELECT
    count(*) AS referenced_lines,
    count(*) FILTER (WHERE l.id IS NULL) AS missing_adjusted_lines
  FROM public.supply_purchase_partial_adjustments a
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(a.line_adjustments) = 'array'
      THEN a.line_adjustments ELSE '[]'::jsonb END
  ) AS line_json
  LEFT JOIN public.supply_purchase_order_items l
    ON l.id::text = line_json->>'line_id'
  WHERE line_json->>'line_id' IS NOT NULL
)
SELECT to_jsonb(adjustments.*) || to_jsonb(lines.*) AS integrity_metrics
FROM adjustments CROSS JOIN lines;

COMMIT;
