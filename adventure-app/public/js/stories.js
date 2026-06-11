/* ============================================================
   Select Your Destiny — Story Library
   Placeholders available in any text:
     {kid}      — child's name
     {adult}    — grown-up's name
     {doctor}   — doctor's name
     {practice} — practice name
     {office}   — office / waiting-room description written by staff
   Scene spec:
     bg     — background id (waiting, space, jungle, ocean, city, party)
     cast   — [{who, x, pose, flip?}]  who: kid|adult|doctor|alien|dino|
              dinobaby|octo|gremlin|turtle
     props  — list of prop ids (logoSign, logoFlag, rocket, sub, clam,
              badge, medal, map, jeep, confetti)
     bubble — {who: castIndex, text}
   ============================================================ */

const THEMES = {

  /* ------------------------------------------------ SPACE */
  space: {
    name: "Blast Off to Space",
    emoji: "🚀",
    tagline: "Rockets, aliens & a glittering star map!",
    color: "#2b2d6e",
    start: "intro",
    nodes: {
      intro: {
        text: "It starts like any visit to {practice}. {office} But today, behind the fish tank, a SECRET DOOR slides open with a whoosh of stardust!",
        scene: { bg: "waiting", cast: [
          { who: "kid", x: 280, pose: "wave" },
          { who: "adult", x: 380, pose: "stand" }
        ], props: ["logoSign", "stardoor"] },
        bubble: { who: 0, text: "Whoa!!" },
        choices: [
          { label: "🚪 Step through the secret door!", to: "hangar" },
          { label: "🩺 Ask {doctor} what's behind it", to: "docbrief" }
        ]
      },
      docbrief: {
        text: "{doctor} grins and pulls a shiny SPACE BADGE from a coat pocket. \"I've been waiting for a brave explorer like you, {kid}. The galaxy needs help — take this!\"",
        scene: { bg: "waiting", cast: [
          { who: "doctor", x: 300, pose: "point" },
          { who: "kid", x: 460, pose: "cheer", flip: true },
          { who: "adult", x: 560, pose: "stand", flip: true }
        ], props: ["badge", "logoSign"] },
        bubble: { who: 0, text: "The galaxy needs YOU!" },
        choices: [
          { label: "🎖️ Take the badge and march to the hangar", to: "hangar" }
        ]
      },
      hangar: {
        text: "Inside is a sparkling space hangar! Two ships hum and glow, each painted with the {practice} logo. {adult} buckles on a helmet too — no explorer goes alone!",
        scene: { bg: "space", cast: [
          { who: "kid", x: 250, pose: "point" },
          { who: "adult", x: 340, pose: "stand" }
        ], props: ["rocket", "logoFlag"] },
        bubble: { who: 0, text: "Which one?!" },
        choices: [
          { label: "🔴 The mighty RED COMET", to: "asteroids" },
          { label: "⭐ The bouncy STAR HOPPER", to: "moonbounce" }
        ]
      },
      asteroids: {
        text: "3… 2… 1… BLAST OFF! The Red Comet zooms into a field of marshmallow-soft asteroids. They bounce off the window — boing, boing!",
        scene: { bg: "space", cast: [
          { who: "kid", x: 300, pose: "cheer" },
          { who: "adult", x: 400, pose: "wave" }
        ], props: ["rocket", "asteroids"] },
        bubble: { who: 1, text: "Hold on tight!" },
        choices: [
          { label: "🌀 Zig-zag between them", to: "alien" },
          { label: "🎵 Honk the space horn so they roll away", to: "alien" }
        ]
      },
      moonbounce: {
        text: "The Star Hopper lands on the Moon and BOUNCES like a trampoline! {kid} and {adult} do three flips before landing in soft moon-dust.",
        scene: { bg: "space", cast: [
          { who: "kid", x: 330, pose: "cheer" },
          { who: "adult", x: 440, pose: "cheer" }
        ], props: ["moon"] },
        bubble: { who: 0, text: "Wheee!" },
        choices: [
          { label: "👣 Follow the glowing footprints", to: "alien" }
        ]
      },
      alien: {
        text: "A small green alien named Zibble waves sadly. \"I lost my STAR MAP! Without it I can't find my way home to the Twinkle Nebula.\"",
        scene: { bg: "space", cast: [
          { who: "alien", x: 280, pose: "wave" },
          { who: "kid", x: 440, pose: "stand", flip: true },
          { who: "adult", x: 540, pose: "stand", flip: true }
        ] },
        bubble: { who: 0, text: "Can you help me?" },
        choices: [
          { label: "🔍 Search the craters for the map", to: "starmap" },
          { label: "📡 Call Space Doc {doctor} for backup", to: "docspace" }
        ]
      },
      docspace: {
        text: "ZOOM! A clinic-ship swoops down and out steps {doctor} in a space suit, holding a famous Star-Scanner. \"A doctor always finds what's lost — let's scan the sky together!\"",
        scene: { bg: "space", cast: [
          { who: "doctor", x: 280, pose: "point" },
          { who: "kid", x: 440, pose: "cheer", flip: true },
          { who: "alien", x: 560, pose: "wave", flip: true }
        ], props: ["logoFlag"] },
        bubble: { who: 0, text: "Beep beep… found it!" },
        choices: [
          { label: "✨ Follow the scanner's sparkly trail", to: "starmap" }
        ]
      },
      starmap: {
        text: "There it is — the Star Map, glittering inside a crystal crater! Zibble cheers so hard their antennae spin. The map shows TWO amazing paths home…",
        scene: { bg: "space", cast: [
          { who: "kid", x: 280, pose: "point" },
          { who: "alien", x: 430, pose: "cheer" },
          { who: "adult", x: 560, pose: "wave" }
        ], props: ["map"] },
        bubble: { who: 1, text: "My map! Hooray!" },
        choices: [
          { label: "🌈 Fly Zibble home past Rainbow Planet", to: "end_rainbow" },
          { label: "🏅 Race back for the Hero Medal ceremony", to: "end_medal" }
        ]
      },
      end_rainbow: {
        ending: true,
        title: "The Rainbow Planet Landing",
        text: "{kid} and {adult} fly Zibble home past Rainbow Planet, where the rings taste like fruit snacks. The whole Twinkle Nebula lights up to say THANK YOU, {kid} — bravest explorer from {practice}!",
        scene: { bg: "party", cast: [
          { who: "kid", x: 300, pose: "cheer" },
          { who: "alien", x: 420, pose: "cheer" },
          { who: "adult", x: 540, pose: "cheer" }
        ], props: ["confetti", "logoFlag"] },
        bubble: { who: 1, text: "Best friends forever!" }
      },
      end_medal: {
        ending: true,
        title: "The Hero Medal Ceremony",
        text: "Back at {practice}, {doctor} pins a golden HERO MEDAL on {kid}'s chest while Zibble beams a thank-you message across the whole galaxy. What an adventure!",
        scene: { bg: "party", cast: [
          { who: "doctor", x: 290, pose: "point" },
          { who: "kid", x: 440, pose: "cheer", flip: true },
          { who: "adult", x: 560, pose: "wave", flip: true }
        ], props: ["medal", "confetti", "logoSign"] },
        bubble: { who: 0, text: "Galaxy-class bravery!" }
      }
    }
  },

  /* ------------------------------------------------ DINOSAURS */
  dino: {
    name: "Dinosaur Discovery",
    emoji: "🦕",
    tagline: "Help a lost baby dino find its family!",
    color: "#2e7d32",
    start: "intro",
    nodes: {
      intro: {
        text: "At {practice}, the dinosaur poster on the wall WINKS at {kid}. {office} Suddenly the floor turns to soft jungle moss, and ferns sprout from the chairs!",
        scene: { bg: "waiting", cast: [
          { who: "kid", x: 300, pose: "point" },
          { who: "adult", x: 400, pose: "stand" }
        ], props: ["logoSign", "ferns"] },
        bubble: { who: 0, text: "The poster moved!" },
        choices: [
          { label: "🐾 Follow the tiny dino footprints", to: "trail" },
          { label: "🌳 Climb the giant lookout tree", to: "lookout" }
        ]
      },
      trail: {
        text: "The footprints lead to a baby triceratops sniffling under a fern. \"I'm Tops,\" she squeaks. \"I lost my family in the big jungle!\"",
        scene: { bg: "jungle", cast: [
          { who: "dinobaby", x: 280, pose: "stand" },
          { who: "kid", x: 440, pose: "wave", flip: true },
          { who: "adult", x: 550, pose: "stand", flip: true }
        ] },
        bubble: { who: 0, text: "Sniff… I'm lost." },
        choices: [
          { label: "🐸 Search the singing swamp together", to: "swamp" },
          { label: "🚙 Call the famous Dino Doctor {doctor}", to: "docdino" }
        ]
      },
      lookout: {
        text: "From the treetop, {kid} spots a dinosaur herd far across the valley — and a volcano puffing silly smoke rings. A baby dino below is trying to reach them!",
        scene: { bg: "jungle", cast: [
          { who: "kid", x: 300, pose: "point" },
          { who: "adult", x: 400, pose: "stand" },
          { who: "dinobaby", x: 580, pose: "stand", flip: true }
        ], props: ["volcano"] },
        bubble: { who: 0, text: "A herd! Over there!" },
        choices: [
          { label: "🌿 Take the shortcut through the ferns", to: "swamp" },
          { label: "🥁 Send a jungle drum signal to the herd", to: "herd" }
        ]
      },
      docdino: {
        text: "VROOM! {doctor} bounces up in a jungle jeep with a giant bag of dino snacks. \"Lost dinos always follow the smell of fern cookies — climb in, team!\"",
        scene: { bg: "jungle", cast: [
          { who: "doctor", x: 280, pose: "wave" },
          { who: "kid", x: 450, pose: "cheer", flip: true },
          { who: "dinobaby", x: 570, pose: "stand", flip: true }
        ], props: ["jeep", "logoFlag"] },
        bubble: { who: 0, text: "Fern cookies, anyone?" },
        choices: [
          { label: "🍪 Lay a cookie trail to the herd", to: "herd" }
        ]
      },
      swamp: {
        text: "The singing swamp burps friendly bubbles! {kid}, {adult} and Tops hop across lily-pad logs — boing, boing, SPLASH — only one soggy sock!",
        scene: { bg: "jungle", cast: [
          { who: "kid", x: 280, pose: "run" },
          { who: "dinobaby", x: 400, pose: "run" },
          { who: "adult", x: 520, pose: "run" }
        ], props: ["lilypads"] },
        bubble: { who: 1, text: "Boing! Boing!" },
        choices: [
          { label: "🦕 There's the herd — run to them!", to: "herd" }
        ]
      },
      herd: {
        text: "THE HERD! Tops's mama trumpets with joy and nuzzles everyone — even {adult}, whose hair is now full of happy dino slobber. But the volcano gives a warning SNEEZE…",
        scene: { bg: "jungle", cast: [
          { who: "dino", x: 250, pose: "stand" },
          { who: "dinobaby", x: 400, pose: "cheer" },
          { who: "kid", x: 520, pose: "cheer", flip: true }
        ], props: ["volcano"] },
        bubble: { who: 0, text: "ACHOO-cano!" },
        choices: [
          { label: "🌼 Lead everyone to the safe sunny meadow", to: "end_meadow" },
          { label: "💃 Throw a giant stomp-dance party", to: "end_party" }
        ]
      },
      end_meadow: {
        ending: true,
        title: "The Sunny Meadow Rescue",
        text: "{kid} leads the whole herd to the sunny meadow, far from the sneezy volcano. Tops gives {kid} a dino-five, and the herd names the meadow \"{kid}'s Valley\" forever!",
        scene: { bg: "party", cast: [
          { who: "kid", x: 280, pose: "cheer" },
          { who: "dinobaby", x: 410, pose: "cheer" },
          { who: "dino", x: 560, pose: "stand" }
        ], props: ["confetti", "logoFlag"] },
        bubble: { who: 1, text: "Dino-five!" }
      },
      end_party: {
        ending: true,
        title: "The Great Stomp-Dance Party",
        text: "STOMP! STOMP! The dance party is so fun the volcano starts dancing too and forgets to sneeze! {doctor} arrives with fern cookies for everyone, and Tops crowns {kid} the Jungle Hero of {practice}!",
        scene: { bg: "party", cast: [
          { who: "doctor", x: 260, pose: "wave" },
          { who: "kid", x: 410, pose: "cheer" },
          { who: "dinobaby", x: 540, pose: "cheer" }
        ], props: ["confetti", "logoSign"] },
        bubble: { who: 2, text: "Stomp stomp hooray!" }
      }
    }
  },

  /* ------------------------------------------------ OCEAN */
  ocean: {
    name: "Deep Sea Quest",
    emoji: "🐙",
    tagline: "Dive for the glowing pearl of Bubble Bay!",
    color: "#0277bd",
    start: "intro",
    nodes: {
      intro: {
        text: "The aquarium at {practice} starts to GLOW. {office} A giant friendly bubble floats out and gently scoops up {kid} and {adult}!",
        scene: { bg: "waiting", cast: [
          { who: "kid", x: 300, pose: "cheer" },
          { who: "adult", x: 410, pose: "wave" }
        ], props: ["logoSign", "bigbubble"] },
        bubble: { who: 0, text: "We're floating!" },
        choices: [
          { label: "🫧 Ride the bubble down to the reef", to: "reef" },
          { label: "🤿 Put on the mini-submarine suits first", to: "sub" }
        ]
      },
      reef: {
        text: "The rainbow reef is buzzing! Ollie the octopus waves seven arms — the eighth is wrapped in seaweed knots. \"I tangled it juggling sea stars,\" he sighs.",
        scene: { bg: "ocean", cast: [
          { who: "octo", x: 280, pose: "stand" },
          { who: "kid", x: 450, pose: "wave", flip: true },
          { who: "adult", x: 560, pose: "stand", flip: true }
        ] },
        bubble: { who: 0, text: "Bit of a tangle…" },
        choices: [
          { label: "🪢 Gently untangle Ollie's arm", to: "pearl" },
          { label: "⛑️ Call the legendary Sea Doctor {doctor}", to: "docsea" }
        ]
      },
      sub: {
        text: "The mini-sub putt-putts through a glowing kelp forest. On the window, drawn in fish kisses, is a map: \"TO THE GLOWING PEARL → FOLLOW THE SINGING FISH.\"",
        scene: { bg: "ocean", cast: [
          { who: "kid", x: 330, pose: "point" },
          { who: "adult", x: 440, pose: "stand" }
        ], props: ["sub", "map"] },
        bubble: { who: 0, text: "A treasure map!" },
        choices: [
          { label: "🎶 Follow the singing fish!", to: "pearl" }
        ]
      },
      docsea: {
        text: "Down swims {doctor} in a shiny diving helmet, carrying waterproof bandages and a seaweed comb. \"Eight arms means eight high-fives after we fix this one!\"",
        scene: { bg: "ocean", cast: [
          { who: "doctor", x: 280, pose: "point" },
          { who: "octo", x: 450, pose: "stand", flip: true },
          { who: "kid", x: 580, pose: "cheer", flip: true }
        ], props: ["logoFlag"] },
        bubble: { who: 1, text: "Eight high-fives!" },
        choices: [
          { label: "🙌 Octo-high-five and swim on", to: "pearl" }
        ]
      },
      pearl: {
        text: "Inside a giant clam glows the legendary PEARL of Bubble Bay! A wise sea turtle named Granny Shells explains: \"It lights the old lighthouse so baby fish find their way home.\"",
        scene: { bg: "ocean", cast: [
          { who: "turtle", x: 280, pose: "stand" },
          { who: "kid", x: 460, pose: "point", flip: true },
          { who: "adult", x: 570, pose: "stand", flip: true }
        ], props: ["clam"] },
        bubble: { who: 0, text: "Will you carry it?" },
        choices: [
          { label: "🐢 Ride the Turtle Express to the lighthouse", to: "end_light" },
          { label: "🐋 Ask the whale choir to sing it home", to: "end_whale" }
        ]
      },
      end_light: {
        ending: true,
        title: "The Lighthouse Lighting",
        text: "{kid} places the pearl in the lighthouse and WHOOSH — the whole bay glows gold! Every baby fish swims home safe, blowing thank-you bubbles that spell {kid}'s name.",
        scene: { bg: "party", cast: [
          { who: "kid", x: 300, pose: "cheer" },
          { who: "turtle", x: 430, pose: "stand" },
          { who: "adult", x: 560, pose: "cheer" }
        ], props: ["confetti", "logoFlag"] },
        bubble: { who: 0, text: "Light it up!" }
      },
      end_whale: {
        ending: true,
        title: "The Whale Choir Concert",
        text: "The whale choir sings the pearl all the way home in the most beautiful concert the ocean has ever heard. {doctor} conducts with a stethoscope, and Ollie claps with all eight arms for {kid}, hero of Bubble Bay!",
        scene: { bg: "party", cast: [
          { who: "doctor", x: 270, pose: "wave" },
          { who: "kid", x: 420, pose: "cheer" },
          { who: "octo", x: 560, pose: "cheer" }
        ], props: ["confetti", "logoSign"] },
        bubble: { who: 2, text: "Encore! Encore!" }
      }
    }
  },

  /* ------------------------------------------------ SUPERHERO */
  hero: {
    name: "Super Hero Day",
    emoji: "🦸",
    tagline: "Cape up and save Giggle City!",
    color: "#c62828",
    start: "intro",
    nodes: {
      intro: {
        text: "A poster at {practice} flashes: \"HERO NEEDED TODAY!\" {office} A secret locker pops open with a TA-DA, revealing hero gear in exactly {kid}'s size!",
        scene: { bg: "waiting", cast: [
          { who: "kid", x: 300, pose: "cheer" },
          { who: "adult", x: 410, pose: "point" }
        ], props: ["logoSign", "locker"] },
        bubble: { who: 1, text: "It has your name on it!" },
        choices: [
          { label: "🦸 Grab the SPARKLE CAPE", to: "city" },
          { label: "🚀 Grab the ROCKET BOOTS", to: "sky" }
        ]
      },
      city: {
        text: "Cape on, {kid} swooshes into Giggle City — where everyone is giggling nervously! The Giggle Gremlin has swiped ALL the city's bandages, and nobody's boo-boos can get patched!",
        scene: { bg: "city", cast: [
          { who: "kid", x: 300, pose: "run", cape: true },
          { who: "adult", x: 420, pose: "run" },
          { who: "gremlin", x: 600, pose: "run" }
        ] },
        bubble: { who: 2, text: "Tee-hee-hee!" },
        choices: [
          { label: "🏃 Chase the gremlin through the park", to: "chase" },
          { label: "🧲 Build a trap with {doctor}", to: "doctrap" }
        ]
      },
      sky: {
        text: "Rocket boots — ON! From way up high, {kid} and {adult} spot the Giggle Gremlin's trail of dropped bandages zig-zagging toward the fountain.",
        scene: { bg: "city", cast: [
          { who: "kid", x: 320, pose: "cheer", cape: true },
          { who: "adult", x: 450, pose: "point" }
        ], props: ["clouds"] },
        bubble: { who: 1, text: "There! By the fountain!" },
        choices: [
          { label: "💨 Swoop down after the gremlin", to: "chase" }
        ]
      },
      doctrap: {
        text: "{doctor} arrives with a wagon-sized STICKER MAGNET. \"Gremlins can't resist sparkly dinosaur stickers — every doctor knows that. Ready, hero {kid}?\"",
        scene: { bg: "city", cast: [
          { who: "doctor", x: 280, pose: "point" },
          { who: "kid", x: 450, pose: "cheer", flip: true, cape: true },
          { who: "adult", x: 570, pose: "stand", flip: true }
        ], props: ["logoFlag", "magnet"] },
        bubble: { who: 0, text: "Stickers: armed!" },
        choices: [
          { label: "✨ Spring the sticker trap!", to: "caught" }
        ]
      },
      chase: {
        text: "The chase is ON — around the fountain, through the bouncy playground, over the hot-dog cart! Then the gremlin slips on a banana peel and lands — FLOOMP — in a pile of pillows.",
        scene: { bg: "city", cast: [
          { who: "kid", x: 300, pose: "run", cape: true },
          { who: "gremlin", x: 520, pose: "run" }
        ], props: ["banana"] },
        bubble: { who: 1, text: "Whoa-oa-FLOOMP!" },
        choices: [
          { label: "🤝 Help the gremlin up", to: "caught" }
        ]
      },
      caught: {
        text: "The Giggle Gremlin sniffles: \"I took the bandages because I have a scraped knee and I was too scared to see a doctor…\" {kid} kneels down and smiles, just like a true hero.",
        scene: { bg: "city", cast: [
          { who: "gremlin", x: 300, pose: "stand" },
          { who: "kid", x: 460, pose: "wave", flip: true, cape: true },
          { who: "adult", x: 570, pose: "stand", flip: true }
        ] },
        bubble: { who: 1, text: "Doctors are friends!" },
        choices: [
          { label: "🏥 Bring the gremlin to {doctor} for a checkup", to: "end_checkup" },
          { label: "🎉 Lead the great Hero Parade home", to: "end_parade" }
        ]
      },
      end_checkup: {
        ending: true,
        title: "The Bravest Checkup Ever",
        text: "At {practice}, {doctor} patches the gremlin's knee with the sparkliest bandage ever, and the gremlin returns every single one — plus extras shaped like stars. \"Checkups aren't scary with a hero like {kid} beside you!\"",
        scene: { bg: "party", cast: [
          { who: "doctor", x: 270, pose: "wave" },
          { who: "gremlin", x: 420, pose: "cheer" },
          { who: "kid", x: 550, pose: "cheer", cape: true }
        ], props: ["confetti", "logoSign"] },
        bubble: { who: 1, text: "That tickled!" }
      },
      end_parade: {
        ending: true,
        title: "The Great Hero Parade",
        text: "Giggle City throws the biggest parade ever! The gremlin hands back every bandage, {adult} carries the giant key to the city, and the mayor declares today \"{kid} Day\" — sponsored proudly by {practice}!",
        scene: { bg: "party", cast: [
          { who: "kid", x: 300, pose: "cheer", cape: true },
          { who: "adult", x: 430, pose: "cheer" },
          { who: "gremlin", x: 560, pose: "cheer" }
        ], props: ["confetti", "logoFlag"] },
        bubble: { who: 0, text: "Hip hip HOORAY!" }
      }
    }
  }
};
