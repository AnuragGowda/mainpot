import type { RecapData, RecapPlayer } from "./recap";

export type RecapOutcome = "big_win" | "win" | "even" | "loss" | "big_loss";

export interface RecapPersona {
  outcome: RecapOutcome;
  eyebrow: string;
  title: string;
  line: string;
}

interface PersonaTemplate {
  anonymousTitle: string;
  namedTitle: string;
  line: string;
}

const PERSONAS: Record<RecapOutcome, PersonaTemplate[]> = {
  big_win: [
    { anonymousTitle: "Mayor of Value Town", namedTitle: "{name} of Value Town", line: "Three streets of value. No speed limit." },
    { anonymousTitle: "The Felt Landlord", namedTitle: "{name} the Felt Landlord", line: "Collected rent every orbit." },
    { anonymousTitle: "The Run-Good Ranger", namedTitle: "Run-Good {name}", line: "Hit by the deck. Declined medical attention." },
    { anonymousTitle: "The Stack Snatcher", namedTitle: "{name} the Stack Snatcher", line: "Started with chips. Left with inventory." },
    { anonymousTitle: "Broadway Management", namedTitle: "Broadway {name}", line: "All paint. No paperwork." },
    { anonymousTitle: "The Nut Peddler", namedTitle: "{name} the Nut Peddler", line: "Kept showing up at the top of range." },
    { anonymousTitle: "The Riverboat Captain", namedTitle: "Riverboat {name}", line: "Took the scenic route to the big stack." },
    { anonymousTitle: "Heater Department", namedTitle: "Heater Season {name}", line: "The deck clocked in for them." },
    { anonymousTitle: "The Check-Raise Chair", namedTitle: "Check-Raise {name}", line: "Checked once. Raised the neighborhood." },
    { anonymousTitle: "The Three-Barrel Treasurer", namedTitle: "Three-Barrel {name}", line: "Value on every street." },
  ],
  win: [
    { anonymousTitle: "The Thin-Value Specialist", namedTitle: "Thin-Value {name}", line: "Found the extra bet and booked it." },
    { anonymousTitle: "The Hero-Call Hotline", namedTitle: "Hero-Call {name}", line: "Someone had to look them up." },
    { anonymousTitle: "The Chip-Up Clerk", namedTitle: "Chip-Up {name}", line: "Quiet shift. Positive drawer." },
    { anonymousTitle: "The C-Bet Collector", namedTitle: "C-Bet {name}", line: "One flop at a time." },
    { anonymousTitle: "The Button Professional", namedTitle: "On-the-Button {name}", line: "Position is a personality trait." },
    { anonymousTitle: "The Showdown Merchant", namedTitle: "Showdown {name}", line: "Had enough of it, often enough." },
    { anonymousTitle: "The Snap-Call Supervisor", namedTitle: "Snap-Call {name}", line: "No tank required." },
    { anonymousTitle: "The Small-Pot Sommelier", namedTitle: "Small-Pot {name}", line: "A tasteful little win." },
    { anonymousTitle: "The Fold-Equity Farmer", namedTitle: "Fold-Equity {name}", line: "Grew a stack without a showdown." },
    { anonymousTitle: "The One-Orbit Wonder", namedTitle: "One-Orbit {name}", line: "Booked the win before the blinds noticed." },
  ],
  even: [
    { anonymousTitle: "The Break-Even Baron", namedTitle: "Break-Even {name}", line: "Played all night for store credit." },
    { anonymousTitle: "The Human Chop Pot", namedTitle: "Chop-Pot {name}", line: "Everybody wins. Especially nobody." },
    { anonymousTitle: "The Variance Dodger", namedTitle: "Variance-Dodger {name}", line: "Variance called. Sent it to voicemail." },
    { anonymousTitle: "The Zero-EV Hero", namedTitle: "Zero-EV {name}", line: "Perfectly balanced, as the solver intended." },
    { anonymousTitle: "The Rake-Free Grinder", namedTitle: "Rake-Free {name}", line: "Four hours. Zero financial plot." },
    { anonymousTitle: "The Check-Check Champion", namedTitle: "Check-Check {name}", line: "Kept the pot and the pulse small." },
    { anonymousTitle: "The Side-Pot Accountant", namedTitle: "Side-Pot {name}", line: "Every chip returned to sender." },
    { anonymousTitle: "The Bankroll Time Traveler", namedTitle: "Time-Travel {name}", line: "Ended exactly where they started." },
    { anonymousTitle: "The Push Specialist", namedTitle: "Push {name}", line: "A tie with excellent table presence." },
    { anonymousTitle: "The Long-Run Tourist", namedTitle: "Long-Run {name}", line: "Saw the variance. Took no souvenirs." },
  ],
  loss: [
    { anonymousTitle: "The River-Tax Resident", namedTitle: "River-Tax {name}", line: "Paid on time. Asked no questions." },
    { anonymousTitle: "The Bluff-Catcher", namedTitle: "Bluff-Catcher {name}", line: "Caught the bluff. Also caught the value bet." },
    { anonymousTitle: "The Gutshot Tourist", namedTitle: "Gutshot {name}", line: "Visited the draw. Missed the connection." },
    { anonymousTitle: "The Cooler Magnet", namedTitle: "Cooler-Magnet {name}", line: "The cards played themselves. Rude of them." },
    { anonymousTitle: "The One-Outer Witness", namedTitle: "One-Outer {name}", line: "Saw the miracle card. Wrong side of it." },
    { anonymousTitle: "The Hero-Fold Historian", namedTitle: "Hero-Fold {name}", line: "Saved the last chips for the memoir." },
    { anonymousTitle: "The Backdoor Tourist", namedTitle: "Backdoor {name}", line: "Needed runner-runner. Got neither-neither." },
    { anonymousTitle: "The Value-Owned Vendor", namedTitle: "Value-Owned {name}", line: "Bet for value. Found premium value." },
    { anonymousTitle: "The Drawing-Thin Delegate", namedTitle: "Drawing-Thin {name}", line: "Technically still had outs." },
    { anonymousTitle: "The Muck Curator", namedTitle: "Muck-It {name}", line: "Preserved the hand for no museum." },
  ],
  big_loss: [
    { anonymousTitle: "Patron Saint of Rebuys", namedTitle: "{name}, Patron of Rebuys", line: "The buy-in found its forever home." },
    { anonymousTitle: "The Felted Philosopher", namedTitle: "Felted {name}", line: "No chips left. Plenty of perspective." },
    { anonymousTitle: "The Buy-In Boomerang", namedTitle: "Buy-In {name}", line: "Every stack came back as a story." },
    { anonymousTitle: "The Bankroll Astronaut", namedTitle: "All-In {name}", line: "Launched the stack. Lost telemetry." },
    { anonymousTitle: "The Cooler Storage Unit", namedTitle: "Cold-Deck {name}", line: "Strong hand. Stronger apology." },
    { anonymousTitle: "The River Donation Desk", namedTitle: "River-Donation {name}", line: "Generous on fifth street." },
    { anonymousTitle: "The Stack-to-Felt Express", namedTitle: "Stack-to-Felt {name}", line: "Nonstop service. No return ticket." },
    { anonymousTitle: "The Rebuy Enthusiast", namedTitle: "Rebuy {name}", line: "Supported the pot through every funding round." },
    { anonymousTitle: "The Downswing Correspondent", namedTitle: "Downswing {name}", line: "Reporting live from below the buy-in." },
    { anonymousTitle: "The All-In Archaeologist", namedTitle: "All-In {name}", line: "Still looking for where the stack went." },
  ],
};

const EYEBROWS: Record<RecapOutcome, string> = {
  big_win: "RAN VERY GOOD",
  win: "BOOKED A WIN",
  even: "BREAK-EVEN",
  loss: "PAID THE RIVER",
  big_loss: "GOT FELTED",
};

function sameNet(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.005;
}

export function recapOutcomeForPlayer(data: RecapData, player: RecapPlayer): RecapOutcome {
  if (Math.abs(player.net) < 0.005) return "even";

  const maxNet = Math.max(...data.players.map((candidate) => candidate.net));
  const minNet = Math.min(...data.players.map((candidate) => candidate.net));
  if (player.net > 0) return sameNet(player.net, maxNet) ? "big_win" : "win";
  return sameNet(player.net, minNet) ? "big_loss" : "loss";
}

export function getRecapPersona(
  data: RecapData,
  playerId: string | undefined,
  variantIndex: number,
  showPlayerName: boolean
): RecapPersona {
  const player = data.players.find((candidate) => candidate.id === playerId)
    ?? data.players[0]
    ?? { id: "table", displayName: "Player", net: 0, rank: 1, rebuyCount: 0 };
  const outcome = recapOutcomeForPlayer(data, player);
  const variants = PERSONAS[outcome];
  const normalizedIndex = ((variantIndex % variants.length) + variants.length) % variants.length;
  const variant = variants[normalizedIndex];
  const firstName = player.displayName.trim().split(/\s+/)[0] || "Player";

  return {
    outcome,
    eyebrow: EYEBROWS[outcome],
    title: showPlayerName
      ? variant.namedTitle.replace("{name}", firstName)
      : variant.anonymousTitle,
    line: variant.line,
  };
}

export function recapPersonaCount(outcome: RecapOutcome): number {
  return PERSONAS[outcome].length;
}
