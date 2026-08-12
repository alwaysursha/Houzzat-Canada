import { stripListingRscRouterStateTree } from "./listing-rsc-guard";
import openNextWorker from "../.open-next/worker.js";

export {
  DOQueueHandler,
  DOShardedTagCache,
  BucketCachePurge,
} from "../.open-next/worker.js";

export default {
  fetch(request, env, ctx) {
    return openNextWorker.fetch(
      stripListingRscRouterStateTree(request),
      env,
      ctx,
    );
  },
};
