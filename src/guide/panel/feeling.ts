// How she seems to be feeling, from the words she types or says. Owner: C.
// A short list of everyday words, matched on this computer. Nothing is sent anywhere, and nothing is kept:
// it only changes Milo's face for a few seconds, so she can see it heard how she said it as well as what.

/** 'sending' is the moment between her saying yes and the note to her helper having gone. */
export type Feeling = 'worried' | 'glad' | 'shocked' | 'reassuring' | 'sending';

const HARD =
  /\b(can'?t|cannot|confus\w*|frustrat\w*|don'?t (understand|know|get it)|do not understand|giv(e|ing) up|too (hard|much|difficult|fast|small)|so hard|difficult|lost|stuck|upset|annoy\w*|hate|stupid|scared|afraid|worried|nervous|ugh|oh no|oh dear|not good|not working|(doesn'?t|won'?t|didn'?t) work|went wrong|broke\w*)\b/;
const GLAD = /\b(thank(s| you)?|lovely|wonderful|great|perfect|brilliant|marvell?ous|yay|hooray|(that|it) worked|i did it|well done|no problem|love (it|this|that))\b/;

/** 'worried' when the words say she is having a hard time, 'glad' when they say it is going well, otherwise null. */
export function feelingOf(words: string): Feeling | null {
  const said = words.toLowerCase().replace(/[’`]/g, "'");
  if (HARD.test(said)) return 'worried';
  if (GLAD.test(said)) return 'glad';
  return null;
}
