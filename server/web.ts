import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';

// `/webhooks` itself is a page of the app; only what hangs below it belongs to the server.
const SERVER_PATHS = /^\/(api(\/|$)|webhooks\/)/;

/**
 * Serves the built front end (`vite build`) so a single process can host the whole demo.
 * Client-side routes fall back to index.html. Without a build the router does nothing: in
 * development the front end runs on Vite.
 */
export function createWebRouter(dir: string): Router {
  const router = Router();
  if (!existsSync(path.join(dir, 'index.html'))) return router;
  router.use(express.static(dir));
  router.get('*', (req, res, next) => {
    // Unknown server routes and missing assets must stay 404 instead of returning the app shell.
    if (SERVER_PATHS.test(req.path) || path.extname(req.path) !== '') {
      next();
      return;
    }
    res.sendFile('index.html', { root: dir });
  });
  return router;
}
