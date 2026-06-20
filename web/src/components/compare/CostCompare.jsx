/**
 * CostCompare — Compare-page wrapper around the shared, HONEST
 * CompetitorCalculator.
 *
 * The real logic (honest sort by actual cost, managed/BYOK + AI toggles,
 * break-even, value pivot when a competitor wins) now lives in
 * ./CompetitorCalculator so /pricing and /compare share one source of truth.
 * This wrapper just loads the live plans (with fallback) so gitstate's
 * per-builder price is always current.
 */
import CompetitorCalculator from './CompetitorCalculator.jsx'
import { usePlans } from '../../lib/usePlans.js'

export default function CostCompare() {
  const { plans } = usePlans()
  return <CompetitorCalculator plans={plans} planKey="team" />
}
