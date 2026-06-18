/**
 * Landing — thin composition page.
 * Each section is independently owned in pages/landing/.
 *
 * Sections (in order):
 *   Hero          hero visual + headline + CTAs
 *   Disciplines   the three honest constraints
 *   DerivedDemo   ticket-vs-diff side-by-side
 *   Features      six key capabilities grid
 *   Stats         four proof numbers strip
 *   ICP           client-billing dev shops callout
 *   CompareTeaser gitstate vs Jira vs Linear table
 *   FinalCTA      closing headline + actions
 */
import MarketingLayout from '../components/marketing/MarketingLayout.jsx'
import Hero from './landing/Hero.jsx'
import Disciplines from './landing/Disciplines.jsx'
import DerivedDemo from './landing/DerivedDemo.jsx'
import Features from './landing/Features.jsx'
import Stats from './landing/Stats.jsx'
import ICP from './landing/ICP.jsx'
import CompareTeaser from './landing/CompareTeaser.jsx'
import FinalCTA from './landing/FinalCTA.jsx'

export default function Landing() {
  return (
    <MarketingLayout>
      <Hero />
      <Disciplines />
      <DerivedDemo />
      <Features />
      <Stats />
      <ICP />
      <CompareTeaser />
      <FinalCTA />
    </MarketingLayout>
  )
}
