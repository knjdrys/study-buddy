/**
 * Seed library — real, usable sample content so a brand-new learner gets a
 * complete first experience: subjects with concepts, flashcards, questions.
 * Written for accuracy; concepts are independent of each other enough to be
 * studied in any order.
 */

import type { Concept, DB, Question, Subject, Topic } from '../domain/types';
import { newId } from '../lib/util';

const now = new Date().toISOString();

interface SeedConcept {
  name: string;
  summary: string;
  explanation: string;
  example?: string;
  misconception?: string;
  flashcards: [string, string][];
  questions: Question[];
  difficulty: 1 | 2 | 3;
}

interface SeedSubject {
  name: string;
  code: string;
  description: string;
  goal: string;
  examOffsetDays: number;
  topics: { name: string; concepts: SeedConcept[] }[];
}

function buildQuestion(
  kind: Question['kind'],
  prompt: string,
  answer: string,
  opts?: { options?: string[]; explanation?: string },
): Question {
  return { id: newId('q'), kind, prompt, answer, options: opts?.options, explanation: opts?.explanation };
}

const BIOLOGY: SeedSubject = {
  name: 'Biology',
  code: 'BIO',
  description: 'Cells, energy, and how living systems work.',
  goal: 'Pass the midterm on cell biology',
  examOffsetDays: 12,
  topics: [
    {
      name: 'Cell structure',
      concepts: [
        {
          name: 'Photosynthesis',
          difficulty: 2,
          summary: 'Photosynthesis is the process plants use to convert light energy into chemical energy stored in glucose.',
          explanation:
            'In the chloroplast, chlorophyll absorbs light and uses its energy to split water molecules. The resulting electrons power the production of ATP and NADPH, which then drive the Calvin cycle — the series of reactions that fixes carbon dioxide into glucose. The oxygen we breathe is released as a by-product of splitting water.',
          example:
            'A pond plant in sunlight produces oxygen bubbles: light drives the light-dependent reactions, splitting water and releasing O₂, while carbon dioxide is assembled into sugar.',
          misconception:
            'A common mix-up: plants get their mass "from the soil". Most of a plant\u2019s dry mass actually comes from carbon dioxide in the air, fixed into sugars by photosynthesis.',
          flashcards: [
            ['What is the overall purpose of photosynthesis?', 'To convert light energy into chemical energy stored in glucose.'],
            ['Which organelle carries out photosynthesis?', 'The chloroplast, using chlorophyll to absorb light.'],
          ],
          questions: [
            buildQuestion('mc', 'Which molecule is the direct product of carbon fixation in the Calvin cycle?', 'A three-carbon sugar', {
              options: ['A three-carbon sugar', 'ATP', 'Oxygen', 'Water'],
              explanation: 'CO₂ is fixed into a three-carbon sugar (G3P), which can later be assembled into glucose.',
            }),
            buildQuestion('tf', 'True or false: oxygen released during photosynthesis comes from carbon dioxide.', 'False', {
              explanation: 'The oxygen comes from splitting water during the light-dependent reactions.',
            }),
          ],
        },
        {
          name: 'Mitochondria',
          difficulty: 1,
          summary: 'Mitochondria are the organelles that generate most of the cell\u2019s ATP through cellular respiration.',
          explanation:
            'Mitochondria have a double membrane. The inner membrane is folded into cristae, which creates a large surface area for the electron transport chain. There, the energy from glucose breakdown is used to pump protons across the membrane; the protons flowing back through ATP synthase produce ATP. This is why mitochondria are called the powerhouse of the cell.',
          example:
            'A muscle cell during exercise is packed with mitochondria — it needs a constant supply of ATP to keep contracting.',
          misconception:
            'Mitochondria do not create energy from nothing. They convert chemical energy held in glucose into ATP, releasing heat as a by-product.',
          flashcards: [
            ['What is the main function of mitochondria?', 'To produce most of the cell\u2019s ATP via cellular respiration.'],
            ['What are cristae and why do they matter?', 'Folds of the inner membrane that increase surface area for the electron transport chain.'],
          ],
          questions: [
            buildQuestion('typed', 'Which organelle is described as the powerhouse of the cell?', 'Mitochondria'),
            buildQuestion('scenario', 'A cell that needs a sudden burst of ATP during exercise — where is most of it made?', 'In mitochondria, via the electron transport chain on the inner membrane.', {
              explanation: 'The folded inner membrane hosts the electron transport chain and ATP synthase.',
            }),
          ],
        },
        {
          name: 'Cell membrane',
          difficulty: 2,
          summary: 'The cell membrane is a phospholipid bilayer that controls what enters and leaves the cell.',
          explanation:
            'Each phospholipid has a hydrophilic (water-loving) head and hydrophobic (water-fearing) tails. In water they arrange themselves into a bilayer with heads facing outward and tails tucked inside. Small non-polar molecules can pass straight through; polar molecules and ions need protein channels or transporters. This selective permeability is what keeps the cell\u2019s interior stable.',
          example:
            'Oxygen and carbon dioxide cross the membrane freely by diffusion, but sodium ions need ion channels to get through.',
          misconception:
            'The membrane is not a rigid wall. It is fluid — proteins and lipids drift within it, which is why it is described by the fluid mosaic model.',
          flashcards: [
            ['What structure forms the cell membrane?', 'A phospholipid bilayer with embedded proteins.'],
            ['Which molecules cross the membrane most easily without help?', 'Small, non-polar molecules such as oxygen and carbon dioxide.'],
          ],
          questions: [
            buildQuestion('mc', 'Why can\u2019t sodium ions pass directly through the phospholipid bilayer?', 'They are charged and water-soluble', {
              options: ['They are charged and water-soluble', 'They are too large to exist inside cells', 'They are non-polar', 'They are destroyed by lipids'],
              explanation: 'Charged particles cannot cross the hydrophobic core of the bilayer without a channel.',
            }),
          ],
        },
      ],
    },
    {
      name: 'Protein synthesis',
      concepts: [
        {
          name: 'Ribosome',
          difficulty: 1,
          summary: 'Ribosomes are the cellular machines that assemble proteins by translating messenger RNA.',
          explanation:
            'A ribosome reads the sequence of codons on an mRNA strand. For each codon, the matching transfer RNA brings the corresponding amino acid, and the ribosome links the amino acids into a growing chain. That chain later folds into a functional protein. Ribosomes are found free in the cytoplasm and bound to the rough endoplasmic reticulum.',
          example:
            'The protein hemoglobin is assembled on ribosomes from the instructions carried by its mRNA — a change in one codon can cause sickle-cell anemia.',
          misconception:
            'Ribosomes do not make DNA or mRNA. They translate the message already carried by mRNA into protein.',
          flashcards: [
            ['What do ribosomes do?', 'Translate messenger RNA into a chain of amino acids (a protein).'],
            ['What is a codon?', 'A sequence of three mRNA bases that specifies one amino acid.'],
          ],
          questions: [
            buildQuestion('typed', 'Which structure translates mRNA into protein?', 'Ribosome'),
            buildQuestion('tf', 'True or false: ribosomes copy DNA to make more DNA.', 'False', {
              explanation: 'DNA is replicated by DNA polymerase; ribosomes translate mRNA into protein.',
            }),
          ],
        },
        {
          name: 'Chloroplast',
          difficulty: 1,
          summary: 'Chloroplasts are plant organelles that absorb light and carry out photosynthesis.',
          explanation:
            'Inside the chloroplast, stacks of membranes called thylakoids hold chlorophyll. Light energy is captured there in the light-dependent reactions. The surrounding fluid, the stroma, hosts the Calvin cycle, where carbon dioxide is turned into sugar. Chloroplasts contain their own DNA, a legacy of their evolutionary origin as free-living bacteria.',
          example:
            'Leaves are green because chlorophyll absorbs red and blue light while reflecting green light.',
          misconception:
            'Plants are not the only photosynthesizers — algae and some bacteria also use chlorophyll-like pigments.',
          flashcards: [
            ['Where does the Calvin cycle take place?', 'In the stroma of the chloroplast.'],
            ['Why are leaves green?', 'Chlorophyll absorbs red and blue light and reflects green.'],
          ],
          questions: [
            buildQuestion('mc', 'Which part of the chloroplast absorbs light?', 'Thylakoid membranes', {
              options: ['Thylakoid membranes', 'Stroma', 'Outer membrane', 'Vacuole'],
            }),
          ],
        },
      ],
    },
  ],
};

const COMPSCI: SeedSubject = {
  name: 'Computer Science',
  code: 'CS',
  description: 'How computation works: data, algorithms, and structure.',
  goal: 'Solidify fundamentals for interviews',
  examOffsetDays: 30,
  topics: [
    {
      name: 'Algorithms',
      concepts: [
        {
          name: 'Binary search',
          difficulty: 2,
          summary: 'Binary search finds an item in a sorted array in O(log n) time by repeatedly halving the search range.',
          explanation:
            'Start with the whole sorted array. Compare the middle element with the target: if they match, you are done. If the target is smaller, search the left half; if larger, the right half. Each comparison discards half of the remaining elements, so n items need at most log₂(n) comparisons — 20 comparisons cover a million items.',
          example:
            'Looking up a word in a dictionary: you open near the middle, see whether your word is before or after, and repeat. That is binary search.',
          misconception:
            'Binary search only works on sorted data. On unsorted data you fall back to linear search, which is O(n).',
          flashcards: [
            ['What is the time complexity of binary search?', 'O(log n).'],
            ['What precondition does binary search require?', 'The array must be sorted.'],
          ],
          questions: [
            buildQuestion('mc', 'A sorted array has 1,000 elements. What is the maximum number of comparisons binary search needs?', 'About 10', {
              options: ['About 10', 'About 100', 'About 500', '1,000'],
              explanation: 'log₂(1000) ≈ 10.',
            }),
            buildQuestion('problem', 'Why can\u2019t you use binary search on an unsorted list? Explain in one or two sentences.', 'Halving depends on knowing which half contains the target; without sorting, comparing to a middle element tells you nothing about the rest.', {
              explanation: 'The discard step is only valid when the array is ordered.',
            }),
          ],
        },
        {
          name: 'Recursion',
          difficulty: 2,
          summary: 'Recursion is a technique where a function calls itself on smaller instances of the same problem until a base case is reached.',
          explanation:
            'Every recursive solution needs two parts: a base case that stops the recursion, and a recursive step that reduces the problem toward that base case. Each call gets its own stack frame, so recursion uses memory proportional to the call depth. Problems that are naturally defined in terms of themselves — trees, sorting, backtracking — are often clearest when written recursively.',
          example:
            'Computing n! — factorial(5) = 5 × factorial(4), factorial(1) = 1 (base case).',
          misconception:
            'Recursion is not always slower than loops. With tail-call optimization, some languages run it as efficiently as iteration — but naive recursion can blow the call stack.',
          flashcards: [
            ['What two parts must every recursive function have?', 'A base case and a recursive step.'],
            ['What happens if the base case is missing?', 'The recursion never stops and the call stack overflows.'],
          ],
          questions: [
            buildQuestion('tf', 'True or false: recursion always uses more memory than iteration.', 'False', {
              explanation: 'Tail-call optimization can make recursion as cheap as a loop.',
            }),
          ],
        },
      ],
    },
    {
      name: 'Data structures',
      concepts: [
        {
          name: 'Hash table',
          difficulty: 3,
          summary: 'A hash table maps keys to values using a hash function, giving average O(1) lookup, insert, and delete.',
          explanation:
            'A hash function turns a key into an array index. Two different keys hashing to the same index is called a collision; hash tables resolve collisions with chaining (linked lists per bucket) or open addressing (probing for a free slot). If too many items land in one bucket, operations degrade toward O(n) — which is why a good hash function spreads keys evenly and tables resize when they get full.',
          example:
            'A dictionary in Python or an object in JavaScript is a hash table: looking up "apple" does not require scanning every word.',
          misconception:
            'Hash table operations are O(1) only on average. The worst case, when many keys collide, is O(n).',
          flashcards: [
            ['What is a collision in a hash table?', 'Two different keys hashing to the same array index.'],
            ['Name one collision-resolution strategy.', 'Chaining (buckets hold lists) or open addressing (probing).'],
          ],
          questions: [
            buildQuestion('mc', 'What is the worst-case lookup time in a hash table with many collisions?', 'O(n)', {
              options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'],
              explanation: 'With all keys in one bucket, lookup degrades to scanning a list.',
            }),
          ],
        },
        {
          name: 'Stack vs queue',
          difficulty: 1,
          summary: 'A stack is last-in-first-out (LIFO); a queue is first-in-first-out (FIFO).',
          explanation:
            'A stack supports push and pop on the same end — like a stack of plates. It is the backbone of function calls and undo systems. A queue supports enqueue at the back and dequeue at the front — like a line at a checkout. Queues drive breadth-first search and task scheduling.',
          example:
            'Browser back button = stack. Printer jobs waiting in order = queue.',
          misconception:
            '"Stack" and "queue" describe behavior, not implementation — both can be built on arrays or linked lists.',
          flashcards: [
            ['What order does a stack process items in?', 'Last in, first out (LIFO).'],
            ['What order does a queue process items in?', 'First in, first out (FIFO).'],
          ],
          questions: [
            buildQuestion('typed', 'Breadth-first search uses which structure to hold the next nodes to visit?', 'Queue'),
          ],
        },
      ],
    },
  ],
};

const ECONOMICS: SeedSubject = {
  name: 'Economics',
  code: 'ECON',
  description: 'Incentives, markets, and how choices get made.',
  goal: 'Understand supply and demand for the final',
  examOffsetDays: 21,
  topics: [
    {
      name: 'Markets',
      concepts: [
        {
          name: 'Supply and demand',
          difficulty: 2,
          summary: 'In a market, price moves to where the quantity supplied equals the quantity demanded.',
          explanation:
            'Demand slopes down: at lower prices, people want to buy more. Supply slopes up: at higher prices, producers want to sell more. The equilibrium price is where the two curves cross. If price sits above equilibrium, a surplus builds and sellers cut prices; below it, a shortage appears and buyers bid prices up. Prices are a signal that coordinates buyers and sellers without anyone planning it.',
          example:
            'A frost kills coffee crops: supply shifts left, and the price of coffee rises as buyers compete for fewer beans.',
          misconception:
            'A price rise is not "greed" alone — it is the market\u2019s way of rationing a scarcer good toward those who value it most.',
          flashcards: [
            ['What happens when price is above equilibrium?', 'A surplus: quantity supplied exceeds quantity demanded, pushing price down.'],
            ['What does a leftward shift in supply mean?', 'At every price, producers want to sell less.'],
          ],
          questions: [
            buildQuestion('mc', 'A new study shows a good improves health. Demand shifts right. What happens to equilibrium price?', 'It rises', {
              options: ['It rises', 'It falls', 'It is unchanged', 'It becomes zero'],
              explanation: 'More demand at every price pushes the equilibrium price up.',
            }),
            buildQuestion('scenario', 'Concert tickets are sold out and resale prices are 3× face value. Which side of the market is "too small" at the original price?', 'Supply — at the original price, quantity demanded exceeds quantity supplied.', {
              explanation: 'Shortage at the set price; buyers bid it up.',
            }),
          ],
        },
        {
          name: 'Opportunity cost',
          difficulty: 1,
          summary: 'The opportunity cost of a choice is the value of the next-best alternative you give up.',
          explanation:
            'Every choice uses scarce resources — time, money, effort — that could have been spent elsewhere. Economists measure cost by the best forgone alternative, not just the money spent. Sunk costs (money already spent that cannot be recovered) should not influence the decision; only what changes going forward matters.',
          example:
            'The cost of an hour of studying is not zero: it is the next-best use of that hour, like sleep or work.',
          misconception:
            'Free things are not costless. A "free" afternoon still costs whatever else you could have done with it.',
          flashcards: [
            ['What is opportunity cost?', 'The value of the next-best alternative forgone when a choice is made.'],
            ['Should sunk costs influence decisions?', 'No — only future costs and benefits matter.'],
          ],
          questions: [
            buildQuestion('tf', 'True or false: a "free" ticket to a movie has no cost.', 'False', {
              explanation: 'The time spent watching could have been used for the next-best activity.',
            }),
          ],
        },
      ],
    },
    {
      name: 'Macro',
      concepts: [
        {
          name: 'Inflation',
          difficulty: 2,
          summary: 'Inflation is a sustained rise in the general price level, which reduces the purchasing power of money.',
          explanation:
            'Inflation is usually measured by tracking the price of a basket of goods over time (like the consumer price index). It can be driven by demand growing faster than supply, or by costs (energy, wages, materials) rising. Moderate, predictable inflation is easier to plan around than high or unpredictable inflation, which distorts saving and investment decisions.',
          example:
            'A coffee that cost $2 a decade ago costs $3.50 today — that difference, on average across goods, is inflation.',
          misconception:
            'Inflation does not mean every price rises evenly. Relative prices still change; inflation is about the general level.',
          flashcards: [
            ['What does inflation reduce?', 'The purchasing power of money.'],
            ['Name one way inflation is measured.', 'A consumer price index — tracking a basket of goods over time.'],
          ],
          questions: [
            buildQuestion('mc', 'If your wage rises 3% and inflation is 5%, what happens to your real purchasing power?', 'It falls by about 2%', {
              options: ['It rises by 8%', 'It rises by 2%', 'It falls by about 2%', 'It is unchanged'],
              explanation: 'Real income ≈ nominal change minus inflation.',
            }),
          ],
        },
        {
          name: 'Comparative advantage',
          difficulty: 3,
          summary: 'A party has comparative advantage when it can produce something at a lower opportunity cost than others — the basis for gains from trade.',
          explanation:
            'Comparative advantage is about opportunity cost, not absolute skill. Even if one country is better at producing everything, both countries gain by specializing in what they are relatively best at and trading. Each produces more of its low-opportunity-cost good and exchanges for the other.',
          example:
            'A surgeon is faster than her assistant at both operating and typing, but the assistant types nearly as well. The surgeon operates; the assistant types — the office produces more of both.',
          misconception:
            'Absolute advantage (being better at everything) does not remove the gains from trade. Comparative advantage does.',
          flashcards: [
            ['What is comparative advantage based on?', 'Lower opportunity cost of producing a good.'],
            ['Can two countries both gain from trade if one is better at everything?', 'Yes — they specialize by comparative advantage.'],
          ],
          questions: [
            buildQuestion('scenario', 'Country A makes 10 cars or 20 shirts a day. Country B makes 4 cars or 20 shirts a day. Who should specialize in cars?', 'Country A — it gives up fewer shirts per car (2 vs 5).', {
              explanation: 'A\u2019s opportunity cost of a car is 2 shirts; B\u2019s is 5 shirts.',
            }),
          ],
        },
      ],
    },
  ],
};

/* ---------------- assemble ---------------- */

export function buildSeedDB(): DB {
  const db: DB = {
    version: 1,
    profile: null,
    settings: {
      theme: 'auto',
      dailyGoalMinutes: 20,
      preferredSessionMinutes: 15,
      notifications: false,
      speech: true,
      ai: { provider: 'none', apiKey: '', model: '' },
    },
    subjects: [],
    topics: [],
    concepts: [],
    decks: [],
    review: {},
    attempts: [],
    sessions: [],
    plans: [],
    goals: [],
    insights: [],
    xp: [],
    sync: { pendingPush: 0, tombstoned: {} },
  };

  const seeds = [BIOLOGY, COMPSCI, ECONOMICS];
  for (const seed of seeds) {
    const subject: Subject = {
      id: newId('sub'),
      name: seed.name,
      code: seed.code,
      description: seed.description,
      goal: seed.goal,
      exam: { date: offsetDate(seed.examOffsetDays) },
      createdAt: now,
      updatedAt: now,
    };
    db.subjects.push(subject);
    for (const [ti, topicSeed] of seed.topics.entries()) {
      const topic: Topic = {
        id: newId('top'),
        subjectId: subject.id,
        name: topicSeed.name,
        position: ti,
      };
      db.topics.push(topic);
      for (const c of topicSeed.concepts) {
        const concept: Concept = {
          id: newId('con'),
          subjectId: subject.id,
          topicId: topic.id,
          name: c.name,
          summary: c.summary,
          explanation: c.explanation,
          example: c.example,
          misconception: c.misconception,
          relatedIds: [],
          resources: [],
          flashcards: c.flashcards.map(([front, back]) => ({ id: newId('fc'), front, back })),
          questions: c.questions.map((q) => ({ ...q, id: newId('q') })),
          difficulty: c.difficulty,
          origin: 'user',
          createdAt: now,
          updatedAt: now,
        };
        db.concepts.push(concept);
      }
    }
    // link related concepts within the subject: chain them
    const ids = db.concepts.filter((c) => c.subjectId === subject.id).map((c) => c.id);
    for (let i = 0; i < ids.length; i++) {
      const c = db.concepts.find((x) => x.id === ids[i])!;
      const prev = ids[i - 1];
      const next = ids[i + 1];
      c.relatedIds = [prev, next].filter((x): x is string => !!x);
    }
  }
  return db;
}

function offsetDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
