import { Hero } from "./_components/Hero"
import { HowItWorks } from "./_components/HowItWorks"
import { MatchingAlgorithm } from "./_components/MatchingAlgorithm"
import { Pricing } from "./_components/Pricing"
import { ForEmployers } from "./_components/ForEmployers"
import { ForGigService } from "./_components/ForGigService"
import { ForWorkers } from "./_components/ForWorkers"
import { TrustSafety } from "./_components/TrustSafety"
import { Stats } from "./_components/Stats"
import { FAQ } from "./_components/FAQ"
import { FinalCTA } from "./_components/FinalCTA"

export default function LandingPage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <MatchingAlgorithm />
      <Pricing />
      <ForEmployers />
      <ForGigService />
      <ForWorkers />
      <TrustSafety />
      <Stats />
      <FAQ />
      <FinalCTA />
    </>
  )
}
