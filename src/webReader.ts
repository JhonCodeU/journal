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
        $('script, style, nav, footer, header, ads, .ads, #ads, button, svg, .social-share, .metadata').remove();

        const title = $('h1').first().text().trim() || 'Untitled Article';

        // Try to find the main content
        let content = '';
        const mainSelectors = [
            '.transcript-content', 
            '.episode-transcript', 
            'article', 
            'main', 
            '.content', 
            '.post-content', 
            '.article-content',
            '.show-notes'
        ];

        let contentFound = false;
        let $mainElement: any = null;

        for (const selector of mainSelectors) {
            const el = $(selector);
            if (el.length > 0) {
                $mainElement = el;
                contentFound = true;
                break;
            }
        }

        if (!contentFound) {
            $mainElement = $('body');
        }

        // Helper function to extract text with proper spacing and filtering
        function extractTextRecursive(node: any): string {
            let text = '';
            
            $(node).contents().each((i, el) => {
                if (el.type === 'text') {
                    text += $(el).text();
                } else if (el.type === 'tag') {
                    const tagName = el.name.toLowerCase();
                    const tagText = extractTextRecursive(el);
                    
                    if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'br'].includes(tagName)) {
                        text += '\n' + tagText + '\n';
                    } else {
                        text += tagText;
                    }
                }
            });
            
            return text;
        }

        content = extractTextRecursive($mainElement);

        // Advanced filtering and cleaning
        const noisePatterns = [
            /^Share$/, /^Play$/, /^RSS$/, /^More episodes$/, /^View all episodes$/,
            /^Subscribe$/, /^Follow me$/, /^Listen on$/, /^About this episode$/,
            /Hosted on Acast/, /Acast. See acast.com\/privacy/,
            /^Intro$/, /^[0-9]{1,2}:[0-9]{2}/, // Timestamps
            /Instagram:/, /TikTok:/, /Twitter:/, /Facebook:/
        ];

        const lines = content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .filter(line => {
                // Filter out lines that match noise patterns
                return !noisePatterns.some(pattern => {
                    if (typeof pattern === 'string') return line === pattern;
                    return pattern.test(line);
                });
            })
            // Filter out lines that are just too short and likely UI noise, unless they look like actual words
            .filter(line => {
                if (line.length > 100) return true; // Long lines are likely content
                if (line.split(' ').length > 4) return true; // Lines with multiple words are likely content
                // If it's short, check if it's just a single word that might be UI noise
                const shortNoise = ['Share', 'Play', 'RSS', 'More', 'View', 'Facebook', 'Instagram', 'Twitter', 'TikTok'];
                return !shortNoise.includes(line);
            });

        content = lines.join('\n\n');

        if (!content || content.length < 50) {
            // If we filtered too much, try a less aggressive fallback
            content = $('p').map((i, el) => $(el).text().trim()).get()
                .filter(p => p.length > 20)
                .join('\n\n');
        }

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