import type { StoredAccount } from "../lib/account.ts";
import { AnnouncementBar, Nav } from "../site/Nav.tsx";
import { Hero, Ticker } from "../site/Hero.tsx";
import {
  Advances,
  CTA,
  Footer,
  Numbers,
  Passport,
  Privacy,
  StackGrid,
  Tiles,
  WhyMonad,
} from "../site/Sections.tsx";

/**
 * The public front page at the root route.
 *
 * It was a separate deployment whose every call to action was an href to
 * somewhere else. Now it is a route like any other, so it knows whether anyone
 * is signed in and offers the next step rather than a door marked "app".
 *
 * It renders without the server. Nothing here reads the chain or the books, and
 * a landing page that goes blank because an API is down would be the worst of
 * both halves — so the config gate lives on the product routes instead.
 */
export function Landing({ account }: { account: StoredAccount | null }) {
  return (
    <>
      <AnnouncementBar />
      <Nav account={account} />
      <main>
        <Hero />
        <Ticker />
        <Numbers />
        <StackGrid />
        <Tiles />
        <Passport />
        <Privacy />
        <WhyMonad />
        <Advances />
        <CTA account={account} />
      </main>
      <Footer account={account} />
    </>
  );
}
