// Empty defaults only. Never ship real profiles, owner roles or activated access codes.
import { SOCIAL_LINKS } from '../../src/constants/socials.js';
export const defaultSeedData = { codes: [], users: [], aiConfig: null, socialSettings: { links: SOCIAL_LINKS, revision: 0 } };
