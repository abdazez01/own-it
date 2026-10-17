import { resolve } from 'node:path';
import { readJson, writeJsRegistry } from './json.mjs';
import { ownItPath } from './paths.mjs';

const GRADES = ['solid', 'partial', 'miss'];
const DASH = /[\u2013\u2014]/;

// Validates the feedback input; returns the clean object. Throws before anything is written.
function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid feedback: expected object');
  const extra = Object.keys(input).filter((k) => !['grades', 'debrief', 'notes'].includes(k));
  if (extra.length) throw new Error(`invalid feedback: unknown key ${extra.join(', ')}`);
  const out = {};
  if (input.grades !== undefined) {
    const g = input.grades;
    if (!g || typeof g !== 'object' || Array.isArray(g)) throw new Error('invalid feedback: grades must be an object');
    for (const [k, v] of Object.entries(g)) {
      if (!/^q[1-5]$/.test(k) || !GRADES.includes(v)) throw new Error(`invalid feedback: grades.${k} must be q1..q5 with solid|partial|miss`);
    }
    out.grades = g;
  }
  if (input.debrief !== undefined) {
    if (typeof input.debrief !== 'string') throw new Error('invalid feedback: debrief must be a string');
    if (input.debrief.split(/\s+/).filter(Boolean).length > 120) throw new Error('invalid feedback: debrief over 120 words');
    if (DASH.test(input.debrief)) throw new Error('invalid feedback: debrief has an em or en dash');
    out.debrief = input.debrief;
  }
  if (input.notes !== undefined) {
    const n = input.notes;
    if (!n || typeof n !== 'object' || Array.isArray(n)) throw new Error('invalid feedback: notes must be an object');
    for (const [k, v] of Object.entries(n)) {
      if (typeof v !== 'string') throw new Error(`invalid feedback: notes.${k} must be a string`);
      if (v.length > 300) throw new Error(`invalid feedback: notes.${k} over 300 chars`);
      if (DASH.test(v)) throw new Error(`invalid feedback: notes.${k} has an em or en dash`);
    }
    out.notes = n;
  }
  if (!Object.keys(out).length) throw new Error('invalid feedback: nothing to write');
  return out;
}

export async function run(args, ctx) {
  const [id, arg] = args._;
  if (!id || !arg) throw new Error('usage: build-feedback <roundId> <file>');
  const session = readJson(ownItPath(ctx.root, 'session.json'), { rounds: {} });
  if (!Object.hasOwn(session.rounds || {}, id)) throw new Error(`unknown round "${id}"`);
  const data = validate(readJson(resolve(ctx.root, arg)));
  writeJsRegistry(ownItPath(ctx.root, 'data', `feedback-${id}.js`), 'OWNIT_FEEDBACK', id, data);
  return { id };
}
