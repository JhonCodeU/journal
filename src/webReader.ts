import axios from 'axios';
import * as cheerio from 'cheerio';
import chalk from 'chalk';

export interface WebArticle {
    title: string;
    content: string;
    url: string;
}

export async function fetchArticle(url: string): Promise<WebArticle | null> {
    try {
        console.log(chalk.blue('\nFetching article content...'));
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);

        // Remove unnecessary elements
        $('script, style, nav, footer, header, ads, .ads, #ads').remove();

        const title = $('h1').first().text().trim() || 'Untitled Article';

        // Try to find the main content
        let content = '';
        const mainSelectors = ['article', 'main', '.content', '.post-content', '.article-content'];

        let contentFound = false;
        for (const selector of mainSelectors) {
            const el = $(selector);
            if (el.length > 0) {
                content = el.text().trim();
                contentFound = true;
                break;
            }
        }

        if (!contentFound) {
            // Fallback to body paragraphs
            content = $('p').map((i, el) => $(el).text()).get().join('\n\n');
        }

        // Clean up whitespace
        content = content.replace(/\n\s*\n/g, '\n\n').trim();

        if (!content) {
            throw new Error('Could not extract any meaningful content from this URL.');
        }

        return {
            title,
            content,
            url
        };
    } catch (error: any) {
        console.log(chalk.red(`\nError fetching the article: ${error.message}`));
        return null;
    }
}