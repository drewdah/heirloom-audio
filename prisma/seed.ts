/**
 * Dev seed — populates the first user in the DB with 8 classic books,
 * real cover art from Open Library, and realistic chapter lists.
 *
 * Usage:  npx tsx prisma/seed.ts
 *    or:  npm run db:seed          (after adding the script to package.json)
 *
 * Safe to re-run: skips books whose title already exists for this user.
 */

import { PrismaClient } from "@prisma/client";
import { createWriteStream, existsSync, mkdirSync } from "fs";
import { join } from "path";
import https from "https";
import http from "http";
import sharp from "sharp";

const prisma = new PrismaClient();

// ─── Cover download helper ────────────────────────────────────────────────────

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    const get = url.startsWith("https") ? https.get : http.get;
    const req = get(url, { headers: { "User-Agent": "HeirloomAudio-Seed/1.0" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return downloadFile(res.headers.location!, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
    });
    req.on("error", reject);
  });
}

// ─── Spine color extraction (same logic as src/lib/color-extract.ts) ─────────

async function extractSpineColor(
  buffer: Buffer
): Promise<{ spine: string; bg: string; text: string } | null> {
  try {
    const { data } = await sharp(buffer)
      .resize(64, 96, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const LEVELS = 8;
    const buckets: Record<string, number> = {};
    for (let i = 0; i < data.length; i += 3) {
      const r = Math.floor((data[i] / 255) * (LEVELS - 1));
      const g = Math.floor((data[i + 1] / 255) * (LEVELS - 1));
      const b = Math.floor((data[i + 2] / 255) * (LEVELS - 1));
      const key = `${r},${g},${b}`;
      buckets[key] = (buckets[key] ?? 0) + 1;
    }

    const sorted = Object.entries(buckets)
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => key.split(",").map(Number))
      .filter(([r, g, b]) => {
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const bri = max / (LEVELS - 1);
        return sat > 0.25 && bri > 0.15 && bri < 0.92;
      });

    if (sorted.length === 0) return null;
    const [br, bg, bb] = sorted[0].map((v) => Math.round((v / (LEVELS - 1)) * 255));
    const hex = (r: number, g: number, b: number) =>
      "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

    return {
      spine: hex(Math.round(br * 0.75), Math.round(bg * 0.75), Math.round(bb * 0.75)),
      bg:    hex(Math.round(br * 0.2),  Math.round(bg * 0.2),  Math.round(bb * 0.2)),
      text:  hex(Math.min(255, Math.round(br * 0.5 + 160)), Math.min(255, Math.round(bg * 0.5 + 140)), Math.min(255, Math.round(bb * 0.5 + 140))),
    };
  } catch {
    return null;
  }
}

// ─── Book definitions ─────────────────────────────────────────────────────────

interface SeedBook {
  title: string;
  subtitle?: string;
  author: string;
  narrator: string;
  genre: string;
  publishYear: number;
  description: string;
  coverOlid: string;   // Open Library edition ID  →  covers.openlibrary.org/b/olid/{id}-L.jpg
  chapters: string[];
}

const SEED_BOOKS: SeedBook[] = [
  {
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    narrator: "Jake Gyllenhaal",
    genre: "Literary Fiction",
    publishYear: 1925,
    description:
      "Set in the Jazz Age on Long Island, the novel depicts narrator Nick Carraway's interactions with mysterious millionaire Jay Gatsby and Gatsby's obsession with Daisy Buchanan.",
    coverOlid: "OL7353617M",
    chapters: [
      "Chapter 1 — In My Younger and More Vulnerable Years",
      "Chapter 2 — A Stale and Charming Place",
      "Chapter 3 — Owl Eyes",
      "Chapter 4 — An Elegant Young Rough-Neck",
      "Chapter 5 — The Green Light",
      "Chapter 6 — He Had Thrown Himself Into It",
      "Chapter 7 — The Hottest Day of the Summer",
      "Chapter 8 — The Death Car",
      "Chapter 9 — Epilogue",
    ],
  },
  {
    title: "Dune",
    author: "Frank Herbert",
    narrator: "Scott Brick",
    genre: "Science Fiction",
    publishYear: 1965,
    description:
      "Set in the distant future amidst a feudal interstellar society, Dune tells the story of young Paul Atreides as his family accepts control of the desert planet Arrakis.",
    coverOlid: "OL6990157M",
    chapters: [
      "Book I — Dune — Part 1",
      "Book I — Dune — Part 2",
      "Book I — Dune — Part 3",
      "Book I — Dune — Part 4",
      "Book II — Muad'Dib — Part 1",
      "Book II — Muad'Dib — Part 2",
      "Book II — Muad'Dib — Part 3",
      "Book III — The Prophet — Part 1",
      "Book III — The Prophet — Part 2",
      "Appendix I — The Ecology of Dune",
    ],
  },
  {
    title: "Harry Potter and the Sorcerer's Stone",
    author: "J.K. Rowling",
    narrator: "Jim Dale",
    genre: "Fantasy",
    publishYear: 1997,
    description:
      "The first novel in the Harry Potter series, it follows a young wizard, Harry Potter, as he discovers his magical heritage and begins his education at Hogwarts School.",
    coverOlid: "OL26331930M",
    chapters: [
      "Chapter 1 — The Boy Who Lived",
      "Chapter 2 — The Vanishing Glass",
      "Chapter 3 — The Letters from No One",
      "Chapter 4 — The Keeper of the Keys",
      "Chapter 5 — Diagon Alley",
      "Chapter 6 — The Journey from Platform Nine and Three-Quarters",
      "Chapter 7 — The Sorting Hat",
      "Chapter 8 — The Potions Master",
      "Chapter 9 — The Midnight Duel",
      "Chapter 10 — Halloween",
      "Chapter 11 — Quidditch",
      "Chapter 12 — The Mirror of Erised",
      "Chapter 13 — Nicolas Flamel",
      "Chapter 14 — Norbert the Norwegian Ridgeback",
      "Chapter 15 — The Forbidden Forest",
      "Chapter 16 — Through the Trapdoor",
      "Chapter 17 — The Man with Two Faces",
    ],
  },
  {
    title: "The Hobbit",
    subtitle: "Or There and Back Again",
    author: "J.R.R. Tolkien",
    narrator: "Rob Inglis",
    genre: "Fantasy",
    publishYear: 1937,
    description:
      "Bilbo Baggins, a hobbit who enjoys a comfortable life, is swept into an epic quest to reclaim the dwarf kingdom of Erebor from the dragon Smaug.",
    coverOlid: "OL51711263M",
    chapters: [
      "Chapter 1 — An Unexpected Party",
      "Chapter 2 — Roast Mutton",
      "Chapter 3 — A Short Rest",
      "Chapter 4 — Over Hill and Under Hill",
      "Chapter 5 — Riddles in the Dark",
      "Chapter 6 — Out of the Frying Pan into the Fire",
      "Chapter 7 — Queer Lodgings",
      "Chapter 8 — Flies and Spiders",
      "Chapter 9 — Barrels Out of Bond",
      "Chapter 10 — A Warm Welcome",
      "Chapter 11 — On the Doorstep",
      "Chapter 12 — Inside Information",
      "Chapter 13 — Not at Home",
      "Chapter 14 — Fire and Water",
      "Chapter 15 — The Gathering of the Clouds",
      "Chapter 16 — A Thief in the Night",
      "Chapter 17 — The Clouds Burst",
      "Chapter 18 — The Return Journey",
      "Chapter 19 — The Last Stage",
    ],
  },
  {
    title: "The Count of Monte Cristo",
    author: "Alexandre Dumas",
    narrator: "Bill Homewood",
    genre: "Adventure",
    publishYear: 1844,
    description:
      "Edmond Dantès, a young sailor, is falsely imprisoned. He escapes, acquires a vast fortune, and sets about getting revenge on those responsible for his imprisonment.",
    coverOlid: "OL46867087M",
    chapters: [
      "Part 1 — Marseilles, The Arrival",
      "Part 2 — Father and Son",
      "Part 3 — The Catalans",
      "Part 4 — Conspiracy",
      "Part 5 — The Wedding Feast",
      "Part 6 — The Deputy Procureur du Roi",
      "Part 7 — The Examination",
      "Part 8 — The Château d'If",
      "Part 9 — The Evening of the Betrothal",
      "Part 10 — The King's Closet at the Tuileries",
      "Part 11 — The Corsican Ogre",
      "Part 12 — Father and Son",
      "Part 13 — The Hundred Days",
      "Part 14 — The Two Prisoners",
      "Part 15 — Number 34 and Number 27",
    ],
  },
  {
    title: "Frankenstein",
    subtitle: "Or, The Modern Prometheus",
    author: "Mary Shelley",
    narrator: "Dan Stevens",
    genre: "Gothic Fiction",
    publishYear: 1818,
    description:
      "The story of Victor Frankenstein, a young scientist who creates a sapient creature in an unorthodox scientific experiment. A landmark work of Romantic and Gothic literature.",
    coverOlid: "OL6147070M",
    chapters: [
      "Preface",
      "Letters I–IV",
      "Chapter 1 — My Family",
      "Chapter 2 — The Thirst for Knowledge",
      "Chapter 3 — The University of Ingolstadt",
      "Chapter 4 — The Workshop of Filthy Creation",
      "Chapter 5 — The Catastrophe",
      "Chapter 6 — The Return Home",
      "Chapter 7 — The Death of William",
      "Chapter 8 — The Trial of Justine",
      "Chapter 9 — The Monster's Tale",
      "Chapter 10 — The Demand",
      "Chapter 11 — The Creation of the Female",
      "Chapter 12 — The Destruction",
      "Chapter 13 — The Pursuit",
      "Chapter 14 — The Dénouement",
    ],
  },
  {
    title: "War and Peace",
    author: "Leo Tolstoy",
    narrator: "Neville Jason",
    genre: "Historical Fiction",
    publishYear: 1869,
    description:
      "Tolstoy's epic masterpiece follows five aristocratic families through the tumultuous years of the Napoleonic Wars, weaving together themes of love, loss, and the nature of history.",
    coverOlid: "OL49765125M",
    chapters: [
      "Volume I, Part 1 — Anna Scherer's Soirée",
      "Volume I, Part 2 — The Battle of Schöngrabern",
      "Volume I, Part 3 — The Battle of Austerlitz",
      "Volume II, Part 1 — After the War",
      "Volume II, Part 2 — Pierre's Duel",
      "Volume II, Part 3 — The Hunt",
      "Volume II, Part 4 — Natasha's First Ball",
      "Volume II, Part 5 — The Engagement",
      "Volume III, Part 1 — Napoleon Crosses the Niemen",
      "Volume III, Part 2 — Borodino",
      "Volume III, Part 3 — The Fall of Moscow",
      "Volume IV, Part 1 — The Guerrilla War",
      "Volume IV, Part 2 — The Retreat",
      "Volume IV, Part 3 — The Liberation",
      "Volume IV, Part 4 — Epilogue",
      "First Epilogue",
      "Second Epilogue — Philosophy of History",
    ],
  },
  {
    title: "Hamlet",
    subtitle: "Prince of Denmark",
    author: "William Shakespeare",
    narrator: "Kenneth Branagh",
    genre: "Tragedy",
    publishYear: 1603,
    description:
      "Prince Hamlet is called to avenge his father's murder by his uncle, now King Claudius. A meditation on mortality, revenge, and the impossibility of certainty.",
    coverOlid: "OL25667349M",
    chapters: [
      "Act I, Scene 1 — Who's There?",
      "Act I, Scene 2 — The Court of Denmark",
      "Act I, Scene 3 — Advice from Laertes",
      "Act I, Scene 4 & 5 — The Ghost",
      "Act II, Scene 1 — Ophelia's Report",
      "Act II, Scene 2 — The Players Arrive",
      "Act III, Scene 1 — To Be, or Not to Be",
      "Act III, Scene 2 — The Mousetrap",
      "Act III, Scene 3 & 4 — The Confrontation",
      "Act IV, Scenes 1–4 — Hamlet Sent to England",
      "Act IV, Scenes 5–7 — Ophelia's Madness",
      "Act V, Scene 1 — The Gravediggers",
      "Act V, Scene 2 — The Duel",
    ],
  },
];

// ─── Main seed function ───────────────────────────────────────────────────────

async function main() {
  // Find the first user — or bail with a helpful message
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    console.error("\n❌  No users found in the database.");
    console.error("   Sign in at least once before running the seed.\n");
    process.exit(1);
  }
  console.log(`\n📚  Seeding for user: ${user.name ?? user.email} (${user.id})\n`);

  // Ensure covers directory exists
  // Use COVERS_DIR env var when seeding against a Docker instance (./data/covers)
  const coversDir = process.env.COVERS_DIR ?? join(process.cwd(), "public", "covers");
  if (!existsSync(coversDir)) mkdirSync(coversDir, { recursive: true });

  for (const book of SEED_BOOKS) {
    // Skip if this book already exists for this user
    const existing = await prisma.book.findFirst({
      where: { userId: user.id, title: book.title },
    });
    if (existing) {
      console.log(`  ⏭   Skipping "${book.title}" (already exists)`);
      continue;
    }

    process.stdout.write(`  📖  "${book.title}" — downloading cover... `);

    // Download cover image
    const coverUrl = `https://covers.openlibrary.org/b/olid/${book.coverOlid}-L.jpg`;
    const localCoverPath = join(coversDir, `seed-${book.coverOlid}.jpg`);
    let coverImageUrl: string | null = null;
    let spineColor: string | null = null;

    try {
      if (!existsSync(localCoverPath)) {
        await downloadFile(coverUrl, localCoverPath);
      }

      // Extract spine color
      const { readFileSync } = await import("fs");
      const buf = readFileSync(localCoverPath);
      const color = await extractSpineColor(buf);
      if (color) spineColor = JSON.stringify(color);

      coverImageUrl = `/covers/seed-${book.coverOlid}.jpg`;
      process.stdout.write("✓ cover  ");
    } catch (e) {
      process.stdout.write(`✗ (${(e as Error).message})  `);
    }

    // Create the book record
    const created = await prisma.book.create({
      data: {
        userId: user.id,
        title: book.title,
        subtitle: book.subtitle ?? null,
        author: book.author,
        narrator: book.narrator,
        genre: book.genre,
        publishYear: book.publishYear,
        description: book.description,
        coverImageUrl,
        spineColor,
        status: "IN_PROGRESS",
      },
    });

    // Create chapters
    await prisma.chapter.createMany({
      data: book.chapters.map((title, i) => ({
        bookId: created.id,
        title,
        order: i,
      })),
    });

    console.log(`✓ ${book.chapters.length} chapters`);
  }

  const total = await prisma.book.count({ where: { userId: user.id } });
  console.log(`\n✅  Done. User now has ${total} book(s) on their shelf.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
