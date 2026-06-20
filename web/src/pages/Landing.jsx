/**
 * Landing — thin composition page.
 * Each section is independently owned in pages/landing/.
 *
 * Narrative (problem → derived-from-git → showcase → proof → who → compare → close):
 *   Hero            hero visual + headline + CTAs + live git-graph motif
 *   TrustBand       honest "works with" platform/stack strip
 *   Disciplines     the five honest constraints
 *   DerivedDemo     ticket-vs-diff side-by-side (the wedge, visceral)
 *   ShowcaseGallery interactive tabbed "see it live" — swaps real screenshots
 *   Capabilities    alternating screenshot showcase (7 caps)
 *   BentoShowcase   image-dense bento grid of the whole surface
 *   Features        six capability cards (two embed shots)
 *   Stats           four proof numbers strip
 *   ICP             client-billing dev shops callout
 *   CompareTeaser   gitstate vs Jira vs Linear table
 *   FAQ             honest answers accordion
 *   FinalCTA        closing headline + actions
 */
import MarketingLayout from '../components/marketing/MarketingLayout.jsx'
import Hero from './landing/Hero.jsx'
import TrustBand from './landing/TrustBand.jsx'
import Disciplines from './landing/Disciplines.jsx'
import DerivedDemo from './landing/DerivedDemo.jsx'
import ShowcaseGallery from './landing/ShowcaseGallery.jsx'
import Features from './landing/Features.jsx'
import Capabilities from './landing/Capabilities.jsx'
import BentoShowcase from './landing/BentoShowcase.jsx'
import Stats from './landing/Stats.jsx'
import ICP from './landing/ICP.jsx'
import CompareTeaser from './landing/CompareTeaser.jsx'
import FAQ from './landing/FAQ.jsx'
import FinalCTA from './landing/FinalCTA.jsx'

export default function Landing() {
  return (
    <MarketingLayout>
      <Hero />
      <TrustBand />
      <Disciplines />
      <DerivedDemo />
      <ShowcaseGallery />
      <Capabilities />
      <BentoShowcase />
      <Features />
      <Stats />
      <ICP />
      <CompareTeaser />
      <FAQ />
      <FinalCTA />
    </MarketingLayout>
  )
}
