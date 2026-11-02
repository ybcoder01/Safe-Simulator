import { useState } from "react";
import { Shell } from "./shell";
import { Provider, useApp } from "./state";
import { Landing, Auth, Country, Onboarding, Verify, Identity } from "./screens/marketing";
import { Home, Search, MapScreen, Category, Listing, Matches, Favorites, Saved } from "./screens/discover";
import { Create, Manage } from "./screens/create";
import { Proposal, Offer, Compare, Trades, Workspace, Schedule, CheckIn, Complete, Review } from "./screens/trade";
import { Messages, Thread, Profile, Settings, Notifications, Safety, Policy, Report, Dispute } from "./screens/account";
import { Admin } from "./screens/admin";
import { Design, States } from "./screens/design";

function Router() {
  const { screen } = useApp();
  switch (screen) {
    case "landing": return <Landing />;
    case "auth": return <Auth />;
    case "country": return <Country />;
    case "onboarding": return <Onboarding />;
    case "verify": return <Verify />;
    case "identity": return <Identity />;
    case "home": return <Home />;
    case "search": return <Search />;
    case "map": return <MapScreen />;
    case "category": return <Category />;
    case "listing": return <Listing />;
    case "create": return <Create />;
    case "manage": return <Manage />;
    case "matches": return <Matches />;
    case "profile": return <Profile />;
    case "favorites": return <Favorites />;
    case "saved": return <Saved />;
    case "proposal": return <Proposal />;
    case "offer": return <Offer />;
    case "compare": return <Compare />;
    case "messages": return <Messages />;
    case "thread": return <Thread />;
    case "trades": return <Trades />;
    case "workspace": return <Workspace />;
    case "schedule": return <Schedule />;
    case "checkin": return <CheckIn />;
    case "complete": return <Complete />;
    case "review": return <Review />;
    case "report": return <Report />;
    case "dispute": return <Dispute />;
    case "notifications": return <Notifications />;
    case "settings": return <Settings />;
    case "safety": return <Safety />;
    case "policy": return <Policy />;
    case "admin": return <Admin />;
    case "design": return <Design />;
    case "states": return <States />;
    default: return <Home />;
  }
}

export function App() {
  const [resetKey, setResetKey] = useState(0);
  return (
    <Provider key={resetKey} onReset={() => setResetKey((value) => value + 1)}>
      <Shell>
        <Router />
      </Shell>
    </Provider>
  );
}
