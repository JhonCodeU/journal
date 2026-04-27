import fs from 'fs';
import chalk from 'chalk';
const STATS_FILE = './stats.json';
const INITIAL_STATS = {
    xp: 0,
    level: 1,
    streak: 0,
    lastActivityDate: null,
    totalWordsLearned: 0,
    totalJournalEntries: 0
};
export function getStats() {
    if (!fs.existsSync(STATS_FILE)) {
        return INITIAL_STATS;
    }
    try {
        const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        return { ...INITIAL_STATS, ...data };
    }
    catch (e) {
        return INITIAL_STATS;
    }
}
export function saveStats(stats) {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}
function calculateLevel(xp) {
    return Math.floor(Math.sqrt(xp / 50)) + 1;
}
export function addXP(amount) {
    const stats = getStats();
    stats.xp += amount;
    const newLevel = calculateLevel(stats.xp);
    if (newLevel > stats.level) {
        console.log(chalk.yellow.bold(`\n🎊 LEVEL UP! You reached Level ${newLevel}! 🎊\n`));
        stats.level = newLevel;
    }
    saveStats(stats);
    console.log(chalk.magenta(`+${amount} XP Gained`));
}
export function updateStreak() {
    const stats = getStats();
    const today = new Date().toDateString();
    if (stats.lastActivityDate === today) {
        return;
    }
    const lastDate = stats.lastActivityDate ? new Date(stats.lastActivityDate) : null;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (lastDate && lastDate.toDateString() === yesterday.toDateString()) {
        stats.streak += 1;
        console.log(chalk.hex('#FFA500').bold(`\n🔥 ${stats.streak} DAY STREAK! Keep it up! 🔥\n`));
    }
    else if (!lastDate || lastDate.toDateString() !== today) {
        stats.streak = 1;
        console.log(chalk.blue(`\nStarting a new streak! Day 1. Welcome back!\n`));
    }
    stats.lastActivityDate = today;
    saveStats(stats);
}
export function getStatsDisplay() {
    const stats = getStats();
    const nextLevelXP = Math.pow(stats.level, 2) * 50;
    const currentLevelXP = Math.pow(stats.level - 1, 2) * 50;
    const progress = stats.xp - currentLevelXP;
    const needed = nextLevelXP - currentLevelXP;
    return {
        level: stats.level,
        xp: stats.xp,
        streak: stats.streak,
        progress: `${progress}/${needed} XP to next level`
    };
}
