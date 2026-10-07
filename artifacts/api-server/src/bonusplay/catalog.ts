export const featureKeys = ["ADS", "SURVEYS", "OFFERS", "GAMES", "EVENTS", "LEADERBOARDS", "REFERRALS", "REDEMPTIONS", "CHESTS"] as const;

const activity = (id: string, category: string, title: string, description: string, type: string, points: number, xp: number, gems = 5, minutes = 0, dailyLimit = 1) =>
  ({ id, category, title, description, type, points, xp, gems, minutes, dailyLimit, enabled: true });

export const activityCatalog = [
  activity("mission-ad", "mission", "Se en video", "Se en simulert annonse og hent bonusen din.", "WATCH_AD", 20, 5, 2),
  activity("mission-game", "mission", "Spill et spill", "Fullfør et minispill i spillhuben.", "PLAY_GAME", 50, 20),
  activity("mission-survey", "mission", "Svar på undersøkelse", "Del meningene dine i en demoundersøkelse.", "SURVEY", 150, 30),
  activity("mission-challenge", "mission", "Dagens challenge", "Fullfør dagens raske utfordring.", "DAILY_CHALLENGE", 100, 25),
  activity("mission-referral", "mission", "Inviter en venn", "Bonusen utløses først når demovennen blir aktiv.", "REFERRAL", 500, 100, 10),
  activity("mission-streak", "mission", "Hent dagens streakbonus", "Hold streaken i live med dagens innsjekking.", "STREAK", 500, 50),
  activity("mission-offer", "mission", "Utforsk et tilbud", "Fullfør et simulert partnertilbud.", "OFFER", 100, 25),
  activity("mission-memory", "mission", "Tren hukommelsen", "Fullfør Memory og hent oppgavebonusen.", "PLAY_GAME", 75, 25),
  activity("mission-reaction", "mission", "Test reaksjonen", "Fullfør reaksjonstesten.", "PLAY_GAME", 50, 20),
  activity("mission-explore", "mission", "Utforsk BONUSPLAY", "Bli kjent med dagens aktiviteter.", "DAILY_CHALLENGE", 30, 10),
  activity("survey-streaming", "survey", "Hva synes du om strømmetjenester?", "Svar på korte demospørsmål.", "SURVEY", 120, 25, 8, 3),
  activity("survey-shopping", "survey", "Hvordan handler du på nett?", "Del dine handlevaner.", "SURVEY", 300, 50, 12, 7),
  activity("survey-consumer", "survey", "Forbrukerundersøkelse", "En bred undersøkelse om forbruk.", "SURVEY", 500, 80, 15, 12),
  activity("survey-media", "survey", "Dine digitale vaner", "Fortell om medievanene dine.", "SURVEY", 200, 35, 8, 5),
  activity("survey-food", "survey", "Mat og hverdagsvalg", "Hva er viktig når du handler mat?", "SURVEY", 180, 30, 8, 4),
  activity("offer-app", "offer", "Test en app", "Prøv en simulert partnerapp. Ingen registrering kreves.", "OFFER", 500, 70, 15),
  activity("offer-partner", "offer", "Registrer deg hos partner", "Simulert registrering – ingen opplysninger sendes til en partner.", "OFFER", 1500, 100, 20),
  activity("offer-service", "offer", "Prøv en tjeneste", "Fullfør en gratis demoprøve uten abonnement.", "OFFER", 2000, 150, 25),
  activity("offer-game", "offer", "Oppdag et nytt spill", "Utforsk et nytt demospill.", "OFFER", 750, 80, 15),
  activity("offer-trial", "offer", "Utforsk et tilbud", "En simulert prøveperiode, helt uten betaling.", "OFFER", 900, 90, 15),
  activity("game-tap", "game", "Tap Challenge", "Trykk så mange ganger du kan på ti sekunder.", "PLAY_GAME", 40, 20, 5, 0, 3),
  activity("game-reaction", "game", "Reaksjonstest", "Vent på signalet og reager så raskt du kan.", "PLAY_GAME", 35, 20, 5, 0, 3),
  activity("game-memory", "game", "Memory", "Finn alle de matchende kortparene.", "PLAY_GAME", 60, 30, 8, 0, 3),
  activity("chest-bronze", "chest", "Bronsekiste", "En gratis demokiste.", "DAILY_CHALLENGE", 50, 10, 2),
  activity("chest-silver", "chest", "Sølvkiste", "En gratis demokiste.", "DAILY_CHALLENGE", 100, 25, 3),
  activity("chest-gold", "chest", "Gullkiste", "En gratis demokiste.", "DAILY_CHALLENGE", 250, 50, 5),
  activity("chest-diamond", "chest", "Diamantkiste", "En gratis demokiste.", "DAILY_CHALLENGE", 500, 100, 10),
  activity("referral-active", "referral", "Aktiv demovenn", "En invitert demovenn har fullført sin første aktivitet.", "REFERRAL", 500, 100, 10),
];

export const rewardCatalog = [
  { id: "giftcard-100", title: "Gavekort", subtitle: "100 kr • Demo", cost: 10000, nokAmount: 100, category: "Gavekort", available: true },
  { id: "giftcard-250", title: "Gavekort", subtitle: "250 kr • Demo", cost: 25000, nokAmount: 250, category: "Gavekort", available: true },
  { id: "paypal-100", title: "PayPal", subtitle: "100 kr • Demo", cost: 10000, nokAmount: 100, category: "PayPal", available: true },
  { id: "giftcard-500", title: "Gavekort", subtitle: "500 kr • Demo", cost: 50000, nokAmount: 500, category: "Gavekort", available: true },
  { id: "gaming-100", title: "Gaming-gavekort", subtitle: "100 kr • Demo", cost: 10000, nokAmount: 100, category: "Gaming", available: true },
];

export const leaderboardNames = ["NordicWolf", "PixelKing", "CashFox", "RewardHunter", "GamerKing", "LunaByte", "ArcticAce", "NovaNinja", "FjordPlayer", "QuestQueen", "BlueBolt", "PlayPanda", "GoldRush", "Skye", "TundraTap", "BitBuddy", "Aurora", "GemSeeker", "NeonFox", "Magnar"];
export const leaderboardScores = [12540, 11820, 10950, 9800, 8750, 8140, 7630, 7140, 6800, 6320, 6100, 5800, 5540, 5210, 4920, 4580, 4180, 3870, 3100, 2450];
