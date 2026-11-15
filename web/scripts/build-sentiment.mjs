import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const raw=await readFile(new URL('../data/sentiment/vader_lexicon.txt',import.meta.url));
const lexicon=Object.fromEntries(raw.toString('utf8').trim().split(/\r?\n/).map(line=>{const [word,score]=line.split('\t'); if(!Number.isFinite(Number(score))) throw Error('Invalid lexicon'); return [word,Number(score)];}));
const metadata={name:'VADER sentiment lexicon',revision:'44fc044cd877310ee8278a0eadf34bcd50d41d06',sha256:createHash('sha256').update(raw).digest('hex'),terms:Object.keys(lexicon).length,license:'MIT',source:'https://github.com/cjhutto/vaderSentiment'};
await writeFile(new URL('../dist/sentiment-lexicon.js',import.meta.url),`// Generated from the licensed VADER lexicon; see /sentiment-license.txt.\nexport const sentimentMetadata=${JSON.stringify(metadata)};\nexport const sentimentLexicon=${JSON.stringify(lexicon)};\n`);
await writeFile(new URL('../dist/sentiment-license.txt',import.meta.url),await readFile(new URL('../data/sentiment/LICENSE.txt',import.meta.url)));
console.log(`Prepared ${metadata.terms} sentiment terms (${metadata.sha256}).`);
