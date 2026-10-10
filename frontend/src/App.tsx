import { AnnouncementBar, Nav } from "./components/Nav.tsx";
import { Hero, Ticker } from "./components/Hero.tsx";
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
} from "./components/Sections.tsx";

// Where the product app lives. On GitHub Pages the marketing page is served at
// /Remi/ and the app one level below it, so the default is relative.
const APP_URL = import.meta.env.VITE_APP_URL ?? "app/";

export function App() {
  return (
    <>
      <AnnouncementBar />
      <Nav appUrl={APP_URL} />
      <main>
        <Hero appUrl={APP_URL} />
        <Ticker />
        <Numbers />
        <StackGrid />
        <Tiles />
        <Passport />
        <Privacy />
        <WhyMonad />
        <Advances />
        <CTA appUrl={APP_URL} />
      </main>
      <Footer appUrl={APP_URL} />
    </>
  );
}
