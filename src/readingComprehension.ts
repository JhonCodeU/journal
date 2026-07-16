import inquirer from 'inquirer';
import chalk from 'chalk';
import { addXP } from './statsManager.js';

interface Question {
  question: string;
  options: string[];
  correct: number;
}

interface Reading {
  id: string;
  title: string;
  level: string;
  text: string;
  questions: Question[];
}

const READINGS: Reading[] = [
  {
    id: 'vals-garden',
    title: "Val's Garden",
    level: 'Beginner (A1-A2)',
    text: `I am new to the city. I do not know anyone. But an old woman lives next door. Her name is Val. She gives me a big box of vegetables.

She grows them in a garden by the sidewalk. There are carrots, tomatoes, beans, and peas. They are the best vegetables I ever ate. Val lives alone, too. But she seems happy in her garden. She loves plants. Sometimes, I can hear her talking to them. Maybe that is why they grow so big.

One day, I stop seeing Val in the garden. I see people take many boxes from her home. Weeds grow in her garden. The dirt is dry. The plants look sad. Val must have passed on.

So I pull the weeds. I water the garden. I even talk to the plants.

Then a family moves next door. They are new to the city. They do not know anyone. And I give them a big box of vegetables from Val's garden.`,
    questions: [
      {
        question: 'How long has the writer of the story lived in the city?',
        options: ['A very long time', 'Not very long', 'Ten years', 'She was born in the city'],
        correct: 1,
      },
      {
        question: 'What kind of vegetable did Val NOT grow?',
        options: ['Tomatoes', 'Carrots', 'Corn', 'Beans and peas'],
        correct: 2,
      },
      {
        question: 'What happened after the writer stopped seeing Val in her garden?',
        options: [
          'No one watered the garden.',
          'People took many boxes from Val\'s house.',
          'Other neighbors took care of the garden.',
          'Val\'s house stayed empty.',
        ],
        correct: 1,
      },
      {
        question: 'Why was the new family lucky?',
        options: [
          'They moved into a good neighborhood.',
          'They had lots of friends in town.',
          'The writer took care of Val\'s garden even after she died.',
          'They had good jobs.',
        ],
        correct: 2,
      },
      {
        question: 'What is something that the writer did NOT do after Val died?',
        options: ['Pull the weeds', 'Water the garden', 'Talk to the plants', 'Learn about Val\'s family'],
        correct: 3,
      },
    ],
  },
  {
    id: 'busy-morning',
    title: 'A Busy Morning',
    level: 'Beginner (A1-A2)',
    text: `Emma wakes up at 6:30 AM. She gets out of bed and goes to the bathroom. She takes a shower and brushes her teeth. Then she goes to the kitchen to make breakfast.

Emma usually eats cereal with milk and a banana. She drinks a cup of coffee. While she eats, she checks her phone for messages.

At 7:15, she gets dressed. She puts on a blue dress and black shoes. She looks at herself in the mirror. She likes her outfit.

She leaves the house at 7:30. She walks to the bus stop. The bus arrives at 7:40. She gets on the bus and finds a seat. She arrives at work at 8:00.

"Good morning, Emma!" says her coworker.

"Good morning!" Emma smiles. It is going to be a good day.`,
    questions: [
      {
        question: 'What time does Emma wake up?',
        options: ['6:00 AM', '6:30 AM', '7:00 AM', '7:30 AM'],
        correct: 1,
      },
      {
        question: 'What does Emma eat for breakfast?',
        options: ['Toast and eggs', 'Cereal with milk and a banana', 'Pancakes and juice', 'Yogurt and fruit'],
        correct: 1,
      },
      {
        question: 'How does Emma get to work?',
        options: ['She drives her car.', 'She walks.', 'She takes the bus.', 'She rides a bike.'],
        correct: 2,
      },
      {
        question: 'What color is Emma\'s dress?',
        options: ['Black', 'Red', 'Green', 'Blue'],
        correct: 3,
      },
      {
        question: 'What time does Emma arrive at work?',
        options: ['7:30', '7:40', '8:00', '8:15'],
        correct: 2,
      },
    ],
  },
  {
    id: 'soccer-game',
    title: 'The Soccer Game',
    level: 'Beginner (A1-A2)',
    text: `It is Saturday afternoon. Tom and his friends are at the park. They are going to play soccer. Tom loves soccer. He plays every weekend.

There are ten people. They make two teams of five. Tom is the captain of one team. His friend Alex is the captain of the other team.

The game starts at 2:00 PM. Tom runs fast. He gets the ball. He passes to Maria. Maria kicks the ball, but the goalkeeper catches it.

In the second half, Tom gets the ball again. He runs toward the goal. He kicks the ball hard. GOAL! Tom's team wins 1-0.

After the game, they are all tired but happy. They go to a cafe to get pizza and drinks. Tom pays for everyone.

"What a great day!" Tom says.`,
    questions: [
      {
        question: 'Where do Tom and his friends play soccer?',
        options: ['At a stadium', 'At the park', 'At school', 'At a sports center'],
        correct: 1,
      },
      {
        question: 'How many people are playing?',
        options: ['Five', 'Ten', 'Fifteen', 'Twenty'],
        correct: 1,
      },
      {
        question: 'Who scores the only goal?',
        options: ['Alex', 'Maria', 'The goalkeeper', 'Tom'],
        correct: 3,
      },
      {
        question: 'What is the final score?',
        options: ['2-0', '1-0', '3-1', '0-0'],
        correct: 1,
      },
      {
        question: 'What do they do after the game?',
        options: ['Go home to sleep', 'Go to a cafe for pizza and drinks', 'Play another game', 'Go swimming'],
        correct: 1,
      },
    ],
  },
  {
    id: 'new-job',
    title: 'A New Job',
    level: 'Intermediate (A2-B1)',
    text: `Carlos moved to Canada six months ago. He is from Mexico. He came to Canada to study English and find a better job.

Last week, Carlos had a job interview at a restaurant downtown. The interview went very well. The manager, Mrs. Chen, liked Carlos because he was polite and had experience in the food industry.

"I am happy to offer you the position," Mrs. Chen said. "You can start on Monday."

Carlos was very excited. He called his mother in Mexico to tell her the news. "Mama, I got a job!" he said. His mother was so happy that she started to cry.

On Monday, Carlos arrived at the restaurant at 8:00 AM. He met the other workers. One of them, a cook named Pierre, was also from another country. Pierre came from France. He and Carlos became friends quickly.

Carlos works as a waiter. He works five days a week. He is learning a lot about Canadian culture. His English is improving every day. He feels proud of himself.

"Canada is my new home," Carlos says with a smile.`,
    questions: [
      {
        question: 'Where is Carlos from?',
        options: ['Canada', 'France', 'Mexico', 'China'],
        correct: 2,
      },
      {
        question: 'Why did Mrs. Chen hire Carlos?',
        options: ['He had a lot of friends.', 'He was polite and had experience.', 'He worked for free.', 'He was from Mexico.'],
        correct: 1,
      },
      {
        question: 'What job did Carlos get?',
        options: ['Cook', 'Manager', 'Waiter', 'Chef'],
        correct: 2,
      },
      {
        question: 'Where is Pierre from?',
        options: ['Mexico', 'Canada', 'France', 'Italy'],
        correct: 2,
      },
      {
        question: 'How does Carlos feel about Canada now?',
        options: ['He misses Mexico.', 'He feels it is his new home.', 'He wants to go back.', 'He is lonely.'],
        correct: 1,
      },
    ],
  },
  {
    id: 'public-transport',
    title: 'Public Transportation',
    level: 'Intermediate (A2-B1)',
    text: `Public transportation is very important in big cities. It helps people move from one place to another without using a car. Buses, trains, subways, and trams are all types of public transportation.

In many cities, public transportation is faster than driving a car because buses and trains have special lanes. It is also cheaper. A monthly pass costs much less than paying for gas and parking.

However, public transportation has some problems. Buses can be very crowded during rush hour. Sometimes trains arrive late. And if you live far from a bus stop or train station, you have to walk a long way.

Despite these problems, millions of people use public transportation every day. It is good for the environment too. One bus can carry as many people as 40 cars. This means less traffic and less pollution.

Some cities have very famous public transportation systems. London has its red double-decker buses and the Tube. Paris has the Metro. New York has its yellow taxis and 24-hour subway. Tokyo has one of the most efficient train systems in the world.

If you visit a new city, try using public transportation. It is a great way to see the city and save money at the same time.`,
    questions: [
      {
        question: 'What is NOT mentioned as a type of public transportation?',
        options: ['Buses', 'Trains', 'Taxis', 'Subways'],
        correct: 2,
      },
      {
        question: 'What is one advantage of public transportation according to the text?',
        options: ['It is always on time.', 'It is cheaper than driving.', 'It is never crowded.', 'It is faster than driving everywhere.'],
        correct: 1,
      },
      {
        question: 'What problem with public transportation is mentioned?',
        options: ['It is too expensive.', 'It is bad for the environment.', 'Buses can be very crowded during rush hour.', 'There are no buses on weekends.'],
        correct: 2,
      },
      {
        question: 'How many people can one bus carry compared to cars?',
        options: ['As many as 10 cars', 'As many as 20 cars', 'As many as 40 cars', 'As many as 100 cars'],
        correct: 2,
      },
      {
        question: 'Which city has a 24-hour subway?',
        options: ['London', 'Paris', 'Tokyo', 'New York'],
        correct: 3,
      },
    ],
  },
  {
    id: 'email-etiquette',
    title: 'Email Etiquette',
    level: 'Intermediate (A2-B1)',
    text: `Writing emails is an important skill in the modern workplace. Whether you are applying for a job or communicating with coworkers, good email etiquette can make a big difference.

First, always use a clear subject line. A subject line like "Meeting on Friday" is better than just "Hi" or no subject at all. The recipient should know what the email is about before opening it.

Second, start with a greeting. "Dear Mr. Smith" is formal and safe. "Hi John" is fine if you know the person well. When in doubt, use the formal option.

Third, keep your message short and clear. People are busy. They do not want to read long paragraphs. Use short sentences and bullet points if needed.

Fourth, check your spelling and grammar. Mistakes can make you look unprofessional. Read your email twice before sending it. You can also use tools like spell check.

Fifth, end with a closing. "Best regards" or "Sincerely" are good options. Then add your name and contact information.

Finally, reply to emails within 24 hours if possible. Even a short reply like "I received your email. I will respond soon" is better than no reply at all.

Good email etiquette shows respect for others and helps you communicate effectively.`,
    questions: [
      {
        question: 'What is the main topic of the text?',
        options: ['How to use computers', 'How to write good emails', 'How to apply for jobs', 'How to use spell check'],
        correct: 1,
      },
      {
        question: 'What kind of subject line does the author recommend?',
        options: ['A short one like "Hi"', 'No subject line', 'A clear one like "Meeting on Friday"', 'A long and detailed one'],
        correct: 2,
      },
      {
        question: 'What greeting does the author suggest when you are not sure?',
        options: ['Hey', 'Hi John', 'Dear Mr. Smith', 'Hello'],
        correct: 2,
      },
      {
        question: 'How soon should you reply to an email if possible?',
        options: ['Within one hour', 'Within 24 hours', 'Within one week', 'Within 48 hours'],
        correct: 1,
      },
      {
        question: 'What does the author say about spelling and grammar mistakes?',
        options: ['They are not important.', 'They can make you look unprofessional.', 'Most people do not notice them.', 'They are acceptable in informal emails.'],
        correct: 1,
      },
    ],
  },
];

async function runReading(reading: Reading): Promise<void> {
  console.clear();
  console.log(chalk.magenta.bold(`\n📖 ${reading.title}`));
  console.log(chalk.gray(`Level: ${reading.level}`));
  console.log(chalk.blue('═'.repeat(56)));

  // Show text
  console.log(chalk.cyan.bold('\nRead the text below:\n'));
  console.log(chalk.white(reading.text));
  console.log(chalk.blue('\n' + '═'.repeat(56)));

  const { ready } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'ready',
      message: 'Ready to answer the questions?',
      default: true,
    },
  ]);

  if (!ready) return;

  let correctCount = 0;

  for (let i = 0; i < reading.questions.length; i++) {
    const q = reading.questions[i];
    console.log(chalk.cyan.bold(`\nQuestion ${i + 1} of ${reading.questions.length}:`));
    console.log(chalk.white(q.question));

    const { answer } = await inquirer.prompt([
      {
        type: 'list',
        name: 'answer',
        message: 'Choose the best answer:',
        choices: q.options.map((opt, idx) => ({ name: `${opt}`, value: idx })),
      },
    ]);

    if (answer === q.correct) {
      console.log(chalk.green('  ✔ Correct!\n'));
      correctCount++;
    } else {
      console.log(chalk.red(`  ✘ Incorrect. The correct answer is: "${chalk.bold(q.options[q.correct])}"\n`));
    }

    await inquirer.prompt([{ type: 'input', name: 'wait', message: 'Press Enter to continue...' }]);
  }

  const xp = correctCount * 20;
  addXP(xp);
  console.log(chalk.blue('═'.repeat(56)));
  console.log(chalk.magenta.bold(`\n📊 Results: ${correctCount}/${reading.questions.length} correct!`));
  console.log(chalk.green.bold(`➕ ${xp} XP gained!`));

  if (correctCount === reading.questions.length) {
    console.log(chalk.yellow.bold('\n🎉 Perfect score! Excellent reading comprehension!\n'));
  } else if (correctCount >= reading.questions.length * 0.6) {
    console.log(chalk.green.bold('\nGood job! Keep practicing to improve!\n'));
  } else {
    console.log(chalk.yellow.bold('\nKeep practicing! Try reading the text more carefully.\n'));
  }
}

export async function interactiveReadingComprehension(): Promise<void> {
  console.log(chalk.magenta.bold('\n📖 Reading Comprehension\n'));
  console.log(chalk.gray('Read short texts and answer questions to test your understanding.\n'));

  const { readingId } = await inquirer.prompt([
    {
      type: 'select',
      name: 'readingId',
      message: 'Select a reading:',
      choices: [
        ...READINGS.map((r) => ({
          name: `${r.title} — ${r.level} (${r.questions.length} questions)`,
          value: r.id,
        })),
        new inquirer.Separator(),
        { name: '↩️  Back to main menu', value: 'back' },
      ],
    },
  ]);

  if (readingId === 'back') return;

  const reading = READINGS.find((r) => r.id === readingId)!;
  await runReading(reading);
}
