import axios from 'axios';
import * as cheerio from 'cheerio';
import chalk from 'chalk';

export interface WebArticle {
    title: string;
    content: string;
    pages: string[];
    url: string;
}

interface SiteConfig {
    selectors: string[];
    noiseFilters?: string[];
    minParagraphLength?: number;
}

const SITE_CONFIGS: Record<string, SiteConfig> = {
    'bbc.com': {
        selectors: ['[data-component="text-block"]', 'article [data-component]', '.ssrcss-1q0x1qg-Paragraph'],
        noiseFilters: ['More to read', 'Más leídas', 'Related Topics', 'Related', 'Also read',
                       'Cómo es vivir en', 'No te lo pierdas', 'Principales noticias',
                       'el nuevo podcast', 'El nuevo podcast', 'Suscríbete aquí',
                       'También puedes seguirnos', 'Y recuerda que puedes',
                       'Haz clic aquí', 'Final de', 'Saltar'],
        minParagraphLength: 40,
    },
    'bbc.co.uk': {
        selectors: ['[data-component="text-block"]', 'article [data-component]', '.story-body__inner'],
        noiseFilters: ['More to read', 'Related'],
        minParagraphLength: 40,
    },
    'nytimes.com': {
        selectors: ['section.StoryBodyCompanionColumn', 'article#story', '.css-53u6y8'],
        minParagraphLength: 30,
    },
    'theguardian.com': {
        selectors: ['article .dcr-1ot1lw', 'article .article-body-commercial-selector'],
        minParagraphLength: 30,
    },
    'reuters.com': {
        selectors: ['article .article-body__content', '.ArticleBody__container'],
        minParagraphLength: 30,
    },
    'washingtonpost.com': {
        selectors: ['article .article-body', 'article .paywall'],
        minParagraphLength: 30,
    },
    'cnn.com': {
        selectors: ['article .article__content', '.zn-body__paragraph'],
        minParagraphLength: 30,
    },
    'wsj.com': {
        selectors: ['article .article-body', '.wsj-article-body'],
        minParagraphLength: 30,
    },
};

function detectSite(url: string): string | null {
    for (const domain of Object.keys(SITE_CONFIGS)) {
        if (url.includes(domain)) return domain;
    }
    return null;
}

async function extractArticle($: cheerio.CheerioAPI, url: string): Promise<string | null> {
    const site = detectSite(url);
    const config = site ? SITE_CONFIGS[site] : null;

    let $mainElement: cheerio.Cheerio<any> | null = null;

    // Site-specific selectors
    if (config) {
        for (const selector of config.selectors) {
            const el = $(selector);
            if (el.length > 0) {
                $mainElement = el.first();
                break;
            }
        }
    }

    // Generic fallback selectors
    if (!$mainElement) {
        const genericSelectors = [
            'article',
            'main',
            '.article-body',
            '.article-content',
            '.post-content',
            '.story-body',
            '.story-body__inner',
            '.content-body',
        ];
        for (const selector of genericSelectors) {
            const el = $(selector);
            if (el.length > 0) {
                $mainElement = el.first();
                break;
            }
        }
    }

    if (!$mainElement) {
        $mainElement = $('body');
    }

    // Remove noise elements from the selected container
    $mainElement.find('script, style, nav, footer, header, button, svg, aside, figure, img, video, iframe, noscript, .ad, .ads, #ad, #ads, .social-share, .social, .share, .metadata, .byline, .dateline, .timestamp, .published-date, .visually-hidden, .screen-reader-text, [aria-hidden="true"]').remove();

    const paragraphs: string[] = [];
    const seen = new Set<string>();
    const minLen = config?.minParagraphLength ?? 30;

    $mainElement.find('p, h1, h2, h3, h4, h5, h6, li, blockquote').each((_i: number, el: any) => {
        const text = $(el).text().trim();
        if (text.length < minLen) return;
        if (seen.has(text)) return;

        // Filter noise phrases
        if (config?.noiseFilters) {
            for (const noise of config.noiseFilters) {
                if (text.includes(noise)) return;
            }
        }

        // Filter common noise patterns
        if (text.includes('Getty Images') ||
            text.includes('AFP via') ||
            text.includes('Fuente de la imagen') ||
            text.includes('Pie de foto') ||
            text.includes('Saltar') ||
            text.includes('Final de') ||
            text.includes('Suscríbete') ||
            text.includes('Haz clic aquí') ||
            text.includes('* * *') ||
            text.match(/^Lecturas más populares/) ||
            text.match(/^También puedes seguirnos/) ||
            text.match(/^Y recuerda que puedes/) ||
            text.match(/^No te lo pierdas/) ||
            text.match(/^Principales noticias/) ||
            text.match(/^[0-9]+\.$/) ||
            text.match(/^Autor,/) ||
            text.match(/^Título del autor/) ||
            text.match(/^Fecha de publicación/) ||
            text.length < minLen) {
            return;
        }

        seen.add(text);
        paragraphs.push(text);
    });

    // If the article has too much noise (recommendations mixed in), try extracting all <p> from body instead
    // and use a stricter filter
    if (paragraphs.filter(p => p.length > 100).length < 5) {
        const fallbackParagraphs: string[] = [];
        const seen2 = new Set<string>();
        $('p').each((_i2: number, el2: any) => {
            const text = $(el2).text().trim();
            if (text.length < 50 || seen2.has(text)) return;
            if (text.includes('Getty Images') || text.includes('Fuente de la imagen') ||
                text.includes('Pie de foto') || text.includes('Saltar ') ||
                text.includes('Suscríbete') || text.includes('Haz clic aquí') ||
                text.includes('Final de ') || text.match(/^[0-9]+\.$/)) return;
            seen2.add(text);
            fallbackParagraphs.push(text);
        });
        if (fallbackParagraphs.filter(p => p.length > 100).length >= 5) {
            return fallbackParagraphs.join('\n\n');
        }
    }

    if (paragraphs.length < 2) {
        // Fallback: all p tags from body
        $('p').each((_i: number, el: any) => {
            const text = $(el).text().trim();
            if (text.length > minLen && !seen.has(text)) {
                seen.add(text);
                paragraphs.push(text);
            }
        });
    }

    return paragraphs.length > 0 ? paragraphs.join('\n\n') : null;
}

function splitIntoPages(content: string): string[] {
    const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0);
    if (paragraphs.length === 0) return [];

    const pages: string[] = [];
    let currentPage: string[] = [];
    let currentLength = 0;
    const MAX_PAGE_LENGTH = 2000;

    for (const para of paragraphs) {
        // Long paragraph: split by sentences
        if (para.length > MAX_PAGE_LENGTH) {
            if (currentPage.length > 0) {
                pages.push(currentPage.join('\n\n'));
                currentPage = [];
                currentLength = 0;
            }

            const sentences = para.match(/[^.!?\n]+[.!?]+/g) || [para];
            let buf: string[] = [];
            let bufLen = 0;

            for (const sentence of sentences) {
                const s = sentence.trim();
                if (bufLen + s.length > MAX_PAGE_LENGTH && buf.length > 0) {
                    pages.push(buf.join(' '));
                    buf = [];
                    bufLen = 0;
                }
                buf.push(s);
                bufLen += s.length;
            }
            if (buf.length > 0) {
                const joined = buf.join(' ');
                if (joined.length < 300 && pages.length > 0) {
                    pages[pages.length - 1] += '\n\n' + joined;
                } else {
                    pages.push(joined);
                }
            }
            continue;
        }

        if (currentLength + para.length > MAX_PAGE_LENGTH && currentPage.length > 0) {
            pages.push(currentPage.join('\n\n'));
            currentPage = [];
            currentLength = 0;
        }

        currentPage.push(para);
        currentLength += para.length;
    }

    if (currentPage.length > 0) {
        pages.push(currentPage.join('\n\n'));
    }

    return pages;
}

export async function fetchArticle(url: string): Promise<WebArticle | null> {
    try {
        console.log(chalk.blue('\nFetching article content...'));
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });

        const $ = cheerio.load(data);

        // Remove unwanted elements globally
        $('script, style, nav, footer, header, button, svg, aside, figure, img, video, iframe, noscript').remove();

        const title = $('h1').first().text().trim() || 'Untitled Article';

        const content = await extractArticle($, url);
        if (!content || content.length < 100) {
            throw new Error('Could not extract any meaningful content from this URL.');
        }

        const pages = splitIntoPages(content);

        return {
            title,
            content,
            pages,
            url,
        };
    } catch (error: any) {
        console.log(chalk.red(`\nError fetching the article: ${error.message}`));
        return null;
    }
}
