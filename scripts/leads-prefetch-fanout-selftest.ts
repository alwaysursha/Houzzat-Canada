/**
 * /agent/leads RSC prefetch fan-out selftest.
 * Run: node --import tsx scripts/leads-prefetch-fanout-selftest.ts
 *
 * Next.js App Router: prefetch={false} never prefetches on viewport or hover.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function linkOpenTags(src: string): string[] {
  const tags: string[] = [];
  const re = /<Link\b[\s\S]*?>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src))) {
    tags.push(match[0]);
  }
  return tags;
}

function isAgentLeadsHref(tag: string) {
  return (
    tag.includes("/agent/leads") ||
    tag.includes("openLeadProfileHref") ||
    (tag.includes("href={href}") && tag.includes("prefetch={false}"))
  );
}

function disablesLeadsPrefetch(tag: string) {
  return (
    tag.includes("prefetch={false}") ||
    tag.includes('prefetch={item.href === "/agent/leads" ? false')
  );
}

function testLeadsPageChipsNeverPrefetch() {
  const src = read("src/app/(agent)/agent/leads/page.tsx");
  const tags = linkOpenTags(src);
  const leadsLinks = tags.filter((tag) => tag.includes("/agent/leads"));
  assert.ok(leadsLinks.length >= 4, "view/layout/clear Links must exist");
  for (const tag of leadsLinks) {
    assert.equal(
      tag.includes("prefetch={false}"),
      true,
      `leads page Link must disable prefetch:\n${tag}`,
    );
  }
  assert.ok(src.includes("take: onlineOnly ? 200 : 100"));
  assert.ok(src.includes("loadLeadsDashboardEngagement"));
  assert.ok(src.includes("computeHotnessMap"));
}

function testKanbanAndReminderLinksNeverPrefetch() {
  const kanban = read("src/components/agent/KanbanLeadLink.tsx");
  const kanbanLink = linkOpenTags(kanban).find((tag) =>
    tag.includes("href={href}"),
  );
  assert.ok(kanbanLink);
  assert.equal(kanbanLink!.includes("prefetch={false}"), true);

  const table = read("src/components/agent/LeadsTableClient.tsx");
  const reminder = linkOpenTags(table).find((tag) =>
    tag.includes("openLeadProfileHref"),
  );
  assert.ok(reminder);
  assert.equal(reminder!.includes("prefetch={false}"), true);
  assert.ok(table.includes("replaceLeadQueryParam(leadId)"));
}

function testAgentChromeLeadsLinksNeverPrefetch() {
  const shell = read("src/components/agent/AgentShell.tsx");
  const leadsNav = linkOpenTags(shell).filter(isAgentLeadsHref);
  assert.ok(leadsNav.length >= 3, "sidebar, Call new, and mobile tab");
  for (const tag of leadsNav) {
    assert.equal(
      disablesLeadsPrefetch(tag),
      true,
      `AgentShell /agent/leads Link must disable prefetch:\n${tag}`,
    );
  }
  assert.ok(shell.includes('prefetch={item.href === "/agent/leads" ? false : true}'));
  assert.ok(
    shell.includes(
      'prefetch={item.href === "/agent/leads" ? false : undefined}',
    ),
  );

  const drawer = read("src/components/agent/ActivityFeedDrawer.tsx");
  const callNew = linkOpenTags(drawer).find((tag) =>
    tag.includes("/agent/leads?view=mine&pipeline=NEW_LEAD"),
  );
  assert.ok(callNew);
  assert.equal(callNew!.includes("prefetch={false}"), true);
}

function testOtherNavPrefetchUnchanged() {
  const shell = read("src/components/agent/AgentShell.tsx");
  assert.ok(shell.includes('{ href: "/agent/tasks", label: "Tasks"'));
  assert.ok(shell.includes('{ href: "/agent", label: "Launchpad"'));
  assert.equal(
    shell.includes("prefetch={false}") &&
      !shell.includes('href="/agent/tasks"\n            prefetch={false}'),
    true,
  );
  assert.ok(
    shell.includes(
      'prefetch={item.href === "/agent/leads" ? false : undefined}',
    ),
    "non-Leads sidebar Links keep default prefetch",
  );
  assert.ok(
    shell.includes('prefetch={item.href === "/agent/leads" ? false : true}'),
    "non-Leads mobile tabs keep explicit prefetch",
  );
}

function testClickContractPreserved() {
  const page = read("src/app/(agent)/agent/leads/page.tsx");
  assert.ok(
    page.includes("`/agent/leads?view=${v.id}&layout=${layout}${filterSuffix}`"),
  );
  assert.ok(page.includes("`/agent/leads?view=${view}&layout=table"));
  assert.ok(page.includes("`/agent/leads?view=${view}&layout=kanban"));
  assert.ok(page.includes("KanbanLeadLink"));
  const kanban = read("src/components/agent/KanbanLeadLink.tsx");
  assert.ok(kanban.includes("replaceLeadQueryParam(leadId)"));
  assert.ok(kanban.includes("event.preventDefault()"));
}

testLeadsPageChipsNeverPrefetch();
testKanbanAndReminderLinksNeverPrefetch();
testAgentChromeLeadsLinksNeverPrefetch();
testOtherNavPrefetchUnchanged();
testClickContractPreserved();

console.log("leads-prefetch-fanout-selftest: ok");
