/* Cloudflare Pages Functions catch-all 入口 */
import app from '../../server/index.js';

export const onRequest = async (context) => {
  return app.fetch(context.request, context.env, context);
};
