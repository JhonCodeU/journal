import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import http from 'http';
import url from 'url';
import chalk from 'chalk';

const STORAGE_FILE = path.resolve('data/storage.json');

interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

function loadTokens(): SpotifyTokens | null {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const data = fs.readFileSync(STORAGE_FILE, 'utf-8');
      const json = JSON.parse(data);
      if (json.spotify) return json.spotify;
    }
  } catch (error) {
    console.error('Error loading tokens:', error);
  }
  return null;
}

function saveTokens(tokens: SpotifyTokens) {
  try {
    let storage: any = {};
    if (fs.existsSync(STORAGE_FILE)) {
      storage = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8'));
    }
    storage.spotify = tokens;
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(storage, null, 2));
  } catch (error) {
    console.error('Error saving tokens:', error);
  }
}

async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokens | null> {
  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);

    const auth = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');

    const response = await axios.post('https://accounts.spotify.com/api/token', params, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const tokens: SpotifyTokens = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token || refreshToken,
      expiresAt: Date.now() + response.data.expires_in * 1000
    };

    saveTokens(tokens);
    return tokens;
  } catch (error) {
    console.error('Error refreshing token:', error);
    return null;
  }
}

async function startOAuthFlow(): Promise<SpotifyTokens> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const parsedUrl = url.parse(req.url || '', true);
      if (parsedUrl.pathname === '/callback') {
        const code = parsedUrl.query.code as string;
        res.end('Authentication successful! You can close this window and return to the terminal.');
        server.close();

        try {
          const params = new URLSearchParams();
          params.append('grant_type', 'authorization_code');
          params.append('code', code);
          params.append('redirect_uri', process.env.SPOTIFY_REDIRECT_URI!);

          const auth = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');

          const response = await axios.post('https://accounts.spotify.com/api/token', params, {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          });

          const tokens: SpotifyTokens = {
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
            expiresAt: Date.now() + response.data.expires_in * 1000
          };

          saveTokens(tokens);
          resolve(tokens);
        } catch (error) {
          reject(error);
        }
      }
    });

    server.listen(3000, () => {
      const authUrl = `https://accounts.spotify.com/authorize?` + new URLSearchParams({
        response_type: 'code',
        client_id: process.env.SPOTIFY_CLIENT_ID!,
        scope: 'user-read-playback-state user-modify-playback-state user-read-currently-playing',
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI!
      }).toString();

      console.log(chalk.cyan('\n🔗 Please open this URL to authenticate with Spotify:'));
      console.log(chalk.underline.blue(authUrl));
      console.log(chalk.yellow('\n(Waiting for callback on port 3000...)\n'));
    });
  });
}

export async function getValidToken(): Promise<string | null> {
  let tokens = loadTokens();

  if (!tokens) {
    tokens = await startOAuthFlow();
  } else if (Date.now() > tokens.expiresAt) {
    tokens = await refreshAccessToken(tokens.refreshToken);
  }

  return tokens ? tokens.accessToken : null;
}

export async function searchShows(query: string) {
  const token = await getValidToken();
  if (!token) return [];

  const response = await axios.get('https://api.spotify.com/v1/search', {
    headers: { 'Authorization': `Bearer ${token}` },
    params: { q: query, type: 'show', limit: 5 }
  });

  return response.data.shows.items;
}

export async function getShowEpisodes(showId: string) {
  const token = await getValidToken();
  if (!token) return [];

  const response = await axios.get(`https://api.spotify.com/v1/shows/${showId}/episodes`, {
    headers: { 'Authorization': `Bearer ${token}` },
    params: { limit: 10 }
  });

  return response.data.items;
}

export async function getEpisode(episodeId: string) {
  const token = await getValidToken();
  if (!token) return null;

  const response = await axios.get(`https://api.spotify.com/v1/episodes/${episodeId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  return response.data;
}
