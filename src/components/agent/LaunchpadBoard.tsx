"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  ChevronRight,
  Clock3,
  Delete,
  Flame,
  House,
  Inbox,
  ListChecks,
  MailOpen,
  MessageCircle,
  MousePointerClick,
  Phone,
  PhoneForwarded,
  Radio,
  UserRound,
} from "lucide-react";
import type { DeskActivityCategory } from "@/lib/agent/desk-activity";
import { cn } from "@/lib/utils";
import styles from "./launchpad-board.module.css";

export type LaunchpadBoardLead = {
  id: string;
  name: string;
  detail: string;
  phone: string | null;
};

export type LaunchpadBoardMessage = {
  leadId: string;
  name: string;
  preview: string | null;
};

export type LaunchpadBoardTask = {
  id: string;
  title: string;
  name: string;
  dueLabel: string;
  overdue: boolean;
  phone: string | null;
  leadId: string | null;
};

export type LaunchpadBoardBooking = {
  id: string;
  title: string;
  who: string;
  whenLabel: string;
  awaiting: boolean;
  detail: string;
  href: string;
};

export type LaunchpadBoardEvent = {
  id: string;
  dayLabel: string;
  title: string;
  whenLabel: string;
  href: string;
};

export type LaunchpadBoardActivity = {
  id: string;
  category: Exclude<DeskActivityCategory, "all">;
  name: string;
  action: string;
  whenLabel: string;
  kindLabel: string;
  leadId: string;
  phone: string | null;
};

type QueueFilter = "all" | "overdue" | "contact";
type Tool = "activity" | "dialer";
type ActivityFilter = "all" | "listings" | "alerts" | "crm";
type ModuleId = "leads" | "messages" | "statistics" | "online";
type ModuleTone = "danger" | "info" | "live" | "msg";

const MOBILE_BOARD_QUERY = "(max-width: 1023px)";
const DESKTOP_MODULES: Record<ModuleId, boolean> = {
  leads: true,
  messages: true,
  statistics: true,
  online: true,
};
const MOBILE_MODULES: Record<ModuleId, boolean> = {
  leads: false,
  messages: false,
  statistics: false,
  online: false,
};

function useMobileBoard() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(MOBILE_BOARD_QUERY);
    const apply = () => setMobile(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return mobile;
}

const MODULE_TONE: Record<ModuleTone, "toneDanger" | "toneInfo" | "toneLive" | "toneMsg"> = {
  danger: "toneDanger",
  info: "toneInfo",
  live: "toneLive",
  msg: "toneMsg",
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+*#]/g, "")}`;
}

function responseLabel(minutes: number): string {
  if (minutes <= 0) return "—";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0 && hours === 0) return days === 1 ? "1 day" : `${days} days`;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0 && mins === 0) return hours === 1 ? "1 hour" : `${hours} hours`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return mins === 1 ? "1 min" : `${mins} min`;
}

function activityMatches(filter: ActivityFilter, category: LaunchpadBoardActivity["category"]) {
  switch (filter) {
    case "all":
      return true;
    case "listings":
      return category === "views_favorites";
    case "alerts":
      return category === "property_alerts";
    case "crm":
      return category === "agent_actions" || category === "notes";
    default: {
      const unreachable: never = filter;
      return unreachable;
    }
  }
}

export function LaunchpadBoard({
  dateLabel,
  dateTime,
  agentName,
  leadsView,
  newLeadCount,
  newLeads,
  unreadCount,
  messages,
  responseMins,
  onlineCount,
  onlineLeads,
  bookings,
  hotLead,
  hotCount,
  overdueCount,
  dueTodayCount,
  tasks,
  contacts,
  upcoming,
  activity,
}: {
  dateLabel: string;
  dateTime: string;
  agentName: string;
  leadsView: "mine" | "team";
  newLeadCount: number;
  newLeads: LaunchpadBoardLead[];
  unreadCount: number;
  messages: LaunchpadBoardMessage[];
  responseMins: number;
  onlineCount: number;
  onlineLeads: LaunchpadBoardLead[];
  bookings: LaunchpadBoardBooking[];
  hotLead: LaunchpadBoardLead | null;
  hotCount: number;
  overdueCount: number;
  dueTodayCount: number;
  tasks: LaunchpadBoardTask[];
  contacts: LaunchpadBoardLead[];
  upcoming: LaunchpadBoardEvent[];
  activity: LaunchpadBoardActivity[];
}) {
  const mobile = useMobileBoard();
  const [desktopOpen, setDesktopOpen] = useState<Record<ModuleId, boolean>>(DESKTOP_MODULES);
  const [mobileOpen, setMobileOpen] = useState<ModuleId | null>(null);
  const openModules = mobile
    ? { ...MOBILE_MODULES, ...(mobileOpen ? { [mobileOpen]: true } : {}) }
    : desktopOpen;
  const [openBooking, setOpenBooking] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueFilter>("all");
  const [tool, setTool] = useState<Tool>("activity");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [number, setNumber] = useState("");
  const [contactName, setContactName] = useState<string | null>(null);
  const toolsRef = useRef<HTMLElement | null>(null);

  const awaitingCount = bookings.filter((row) => row.awaiting).length;
  const visibleActivity = useMemo(
    () => activity.filter((row) => activityMatches(activityFilter, row.category)),
    [activity, activityFilter],
  );
  const queueRows = queue === "contact" ? [] : tasks.filter((task) => queue === "all" || task.overdue);

  function toggleModule(id: ModuleId) {
    if (mobile) {
      setMobileOpen((current) => (current === id ? null : id));
      return;
    }
    setDesktopOpen((current) => ({ ...current, [id]: !current[id] }));
  }

  function openDialer(phone: string | null, name: string | null) {
    setTool("dialer");
    setContactName(name);
    setNumber(phone?.replace(/[^\d+*#]/g, "") ?? "");
    window.requestAnimationFrame(() => {
      toolsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  const dialable = number.replace(/[^\d+]/g, "").length >= 7;

  return (
    <div className={styles.board}>
      <header className={styles.head}>
        <div>
          <time dateTime={dateTime}>{dateLabel}</time>
          <p className={styles.agentName}>Hi, {agentName}</p>
          <h1>Launchpad</h1>
        </div>
        <button type="button" onClick={() => openDialer(number || null, contactName)}>
          <Phone aria-hidden /> Open dialer
        </button>
      </header>

      <section className={styles.modules} aria-label="Launchpad quick modules">
        <SummaryCard
          title="Call New Leads"
          subtitle={`${newLeadCount} new lead${newLeadCount === 1 ? "" : "s"} to call`}
          tone="danger"
          icon={<Phone aria-hidden />}
          href={`/agent/leads?view=${leadsView}&pipeline=NEW_LEAD`}
          linkLabel="Open in leads dashboard"
          open={openModules.leads}
          onToggle={() => toggleModule("leads")}
        >
          <ResultList
            empty="No new leads to call right now."
            rows={newLeads.slice(0, 3).map((lead) => ({
              key: lead.id,
              href: `/agent/leads?lead=${lead.id}`,
              title: lead.name,
              detail: lead.detail,
            }))}
          />
        </SummaryCard>
        <SummaryCard
          title="New Messages"
          subtitle={unreadCount === 0 ? "No unread texts or chats" : `${unreadCount} unread`}
          tone="msg"
          icon={<MessageCircle aria-hidden />}
          href="/agent/chats?filter=unread"
          linkLabel="Open chats inbox"
          open={openModules.messages}
          onToggle={() => toggleModule("messages")}
        >
          <ResultList
            empty="No unread messages."
            rows={messages.slice(0, 3).map((row) => ({
              key: row.leadId,
              href: `/agent/chats?filter=unread&lead=${row.leadId}`,
              title: row.name,
              detail: row.preview || "Unread conversation",
            }))}
          />
        </SummaryCard>
        <SummaryCard
          title="Statistics"
          subtitle={`${responseLabel(responseMins)} response time`}
          tone="info"
          icon={<ChartColumn aria-hidden />}
          href="/agent/statistics"
          linkLabel="Open statistics"
          open={openModules.statistics}
          onToggle={() => toggleModule("statistics")}
        >
          <p className={styles.summaryEmpty}>
            {responseMins > 0
              ? `Average first response is ${responseLabel(responseMins)}.`
              : "Not enough responded leads yet."}
          </p>
        </SummaryCard>
        <SummaryCard
          title="Online Leads"
          subtitle={
            onlineCount === 0
              ? "No leads active on the site right now"
              : `${onlineCount} lead${onlineCount === 1 ? "" : "s"} active on the site`
          }
          tone="live"
          icon={<Radio aria-hidden />}
          href={`/agent/leads?view=${leadsView}&online=1`}
          linkLabel="Open in leads dashboard"
          open={openModules.online}
          onToggle={() => toggleModule("online")}
        >
          <ResultList
            empty="Nobody from your desk is on the website right now."
            rows={onlineLeads.slice(0, 3).map((lead) => ({
              key: lead.id,
              href: `/agent/leads?lead=${lead.id}`,
              title: lead.name,
              detail: lead.detail,
            }))}
          />
        </SummaryCard>
      </section>

      <div className={styles.grid}>
        <div className={styles.left}>
          <section className={`${styles.panel} ${styles.bookings}`} aria-labelledby="launchpad-requests">
            <div className={styles.bookingHead}>
              <div className={styles.bookingHeading}>
                <CalendarDays aria-hidden />
                <h2 id="launchpad-requests">Appointment Requests</h2>
              </div>
              <span className={styles.bookingCount}>{awaitingCount} new</span>
            </div>
            {bookings.length === 0 ? (
              <p className={styles.empty}>No showing or valuation requests are waiting.</p>
            ) : (
              bookings.map((booking) => (
                <div key={booking.id}>
                  <div className={styles.bookingRow}>
                    <span className={`${styles.indicator} ${booking.awaiting ? styles.gold : ""}`}>
                      {booking.awaiting ? <House aria-hidden /> : <CalendarCheck aria-hidden />}
                    </span>
                    <div>
                      <strong>{booking.title}</strong>
                      <small>{booking.who}</small>
                      <small>
                        <span className={booking.awaiting ? styles.waiting : styles.booked}>
                          {booking.awaiting ? "Awaiting reply" : "Booked"}
                        </span>
                        {" · "}
                        {booking.whenLabel}
                      </small>
                    </div>
                    <button
                      type="button"
                      className={styles.secondary}
                      aria-expanded={openBooking === booking.id}
                      onClick={() =>
                        setOpenBooking((current) => (current === booking.id ? null : booking.id))
                      }
                    >
                      {booking.awaiting ? "Review" : "View"}
                    </button>
                  </div>
                  {openBooking === booking.id ? (
                    <div className={styles.detail}>
                      <strong>{booking.title}</strong>
                      {booking.detail}{" "}
                      <Link href={booking.href}>Open appointment</Link>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </section>

          <div className={styles.signals}>
            <section className={styles.spot} aria-labelledby="launchpad-hot-lead">
              <div className={styles.flag}>
                <Flame aria-hidden /> {hotCount} hot lead{hotCount === 1 ? "" : "s"}
              </div>
              <h2 id="launchpad-hot-lead">{hotLead?.name ?? "No hot lead"}</h2>
              <p>{hotLead?.detail ?? "No lead is hot enough to surface right now."}</p>
              {hotLead ? (
                hotLead.phone ? (
                  <a href={telHref(hotLead.phone)} onClick={() => openDialer(hotLead.phone, hotLead.name)}>
                    <Phone aria-hidden /> Call {hotLead.name.split(" ")[0]}
                  </a>
                ) : (
                  <Link href={`/agent/leads?lead=${hotLead.id}`}>Open {hotLead.name.split(" ")[0]}</Link>
                )
              ) : null}
            </section>
            <section className={styles.overdue} aria-label="Overdue tasks">
              <span className={styles.alarm}><Clock3 aria-hidden /></span>
              <strong>{overdueCount}</strong>
              <b>Overdue tasks</b>
              <Link href="/agent/tasks#overdue">
                Review overdue <ArrowRight aria-hidden />
              </Link>
            </section>
          </div>

          <section className={styles.panel} aria-labelledby="launchpad-queue">
            <div className={styles.phead}>
              <div>
                <h2 id="launchpad-queue">Action queue</h2>
                <small>{dueTodayCount} task{dueTodayCount === 1 ? "" : "s"} due today</small>
              </div>
              <div className={styles.segments} role="group" aria-label="Action queue filter">
                {(["all", "overdue", "contact"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={queue === id}
                    onClick={() => setQueue(id)}
                  >
                    {id === "all" ? "All" : id === "overdue" ? "Overdue" : "Contact"}
                  </button>
                ))}
              </div>
            </div>
            {queue === "contact" ? (
              contacts.length === 0 ? (
                <p className={styles.empty}>No open general contact requests</p>
              ) : (
                contacts.map((lead) => (
                  <div key={lead.id} className={styles.qrow}>
                    <span className={styles.indicator}><Inbox aria-hidden /></span>
                    <div>
                      <strong>{lead.detail}</strong>
                      <small>{lead.name}</small>
                    </div>
                    {lead.phone ? (
                      <a
                        className={styles.secondary}
                        href={telHref(lead.phone)}
                        onClick={() => openDialer(lead.phone, lead.name)}
                      >
                        <Phone aria-hidden /> Call
                      </a>
                    ) : (
                      <Link className={styles.secondary} href={`/agent/leads?lead=${lead.id}`}>Open</Link>
                    )}
                  </div>
                ))
              )
            ) : queueRows.length === 0 ? (
              <p className={styles.empty}>
                {queue === "overdue" ? "No overdue tasks." : "No open tasks."}
              </p>
            ) : (
              queueRows.map((task) => (
                <div key={task.id} className={styles.qrow}>
                  <span className={`${styles.indicator} ${task.overdue ? styles.red : ""}`}>
                    {task.overdue ? <PhoneForwarded aria-hidden /> : <ListChecks aria-hidden />}
                  </span>
                  <div>
                    <strong>{task.title}</strong>
                    <small>{task.name} · {task.dueLabel}</small>
                  </div>
                  {task.phone ? (
                    <a
                      className={styles.secondary}
                      href={telHref(task.phone)}
                      onClick={() => openDialer(task.phone, task.name)}
                    >
                      <Phone aria-hidden /> Call
                    </a>
                  ) : (
                    <Link
                      className={styles.secondary}
                      href={task.leadId ? `/agent/leads?lead=${task.leadId}` : `/agent/tasks#${task.id}`}
                    >
                      Open
                    </Link>
                  )}
                </div>
              ))
            )}
          </section>

          <section className={styles.panel} aria-labelledby="launchpad-agenda">
            <div className={styles.phead}>
              <h2 id="launchpad-agenda">Upcoming appointments</h2>
            </div>
            {upcoming.length === 0 ? (
              <p className={styles.empty}>Nothing is booked ahead.</p>
            ) : (
              <div className={styles.agenda}>
                {upcoming.map((event) => (
                  <Link key={event.id} href={event.href} className={styles.event}>
                    <time>{event.dayLabel}</time>
                    <div>
                      <strong>{event.title}</strong>
                      <small>{event.whenLabel}</small>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside
          ref={toolsRef}
          className={`${styles.panel} ${styles.right}`}
          aria-label="Activity and Dialer"
        >
          <div className={styles.tooltabs} role="group" aria-label="Communication tools">
            <button type="button" aria-pressed={tool === "activity"} onClick={() => setTool("activity")}>
              <Activity aria-hidden /> Activity
            </button>
            <button type="button" aria-pressed={tool === "dialer"} onClick={() => setTool("dialer")}>
              <Phone aria-hidden /> Dialer
            </button>
          </div>
          {tool === "activity" ? (
            <div className={styles.feed}>
              <div className={styles.filter}>
                <label htmlFor="launchpad-activity-filter">Recent activity</label>
                <select
                  id="launchpad-activity-filter"
                  value={activityFilter}
                  onChange={(event) => setActivityFilter(event.target.value as ActivityFilter)}
                >
                  <option value="all">All activity</option>
                  <option value="listings">Listing views</option>
                  <option value="alerts">Alert opens</option>
                  <option value="crm">CRM updates</option>
                </select>
              </div>
              {visibleActivity.length === 0 ? (
                <p className={styles.empty}>No recent activity in this view.</p>
              ) : (
                visibleActivity.map((item) => (
                  <div key={item.id} className={styles.activity}>
                    <span className={`${styles.indicator} ${item.category === "views_favorites" ? styles.gold : ""}`}>
                      {item.category === "views_favorites" ? (
                        <MousePointerClick aria-hidden />
                      ) : item.category === "property_alerts" ? (
                        <MailOpen aria-hidden />
                      ) : (
                        <UserRound aria-hidden />
                      )}
                    </span>
                    <div>
                      <p>
                        <strong>{item.name}</strong> {item.action}
                      </p>
                      <small>
                        {item.whenLabel} · {item.kindLabel}
                        {item.phone ? (
                          <a href={telHref(item.phone)} onClick={() => openDialer(item.phone, item.name)}>
                            Call
                          </a>
                        ) : (
                          <Link href={`/agent/leads?lead=${item.leadId}`}>Open</Link>
                        )}
                      </small>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <form
              className={styles.dial}
              onSubmit={(event) => {
                event.preventDefault();
                if (!dialable) return;
                window.location.href = telHref(number);
              }}
            >
              {contactName ? <p className={styles.contact}>{contactName}</p> : null}
              <label htmlFor="launchpad-number">Phone number</label>
              <input
                id="launchpad-number"
                type="tel"
                autoComplete="off"
                placeholder="Enter phone number"
                maxLength={24}
                value={number}
                onChange={(event) => setNumber(event.target.value)}
              />
              <div className={styles.keys} role="group" aria-label="Keypad">
                {KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setNumber((current) => `${current}${key}`.slice(0, 24))}
                  >
                    {key}
                  </button>
                ))}
              </div>
              <div className={styles.dialActions}>
                <a
                  className={styles.call}
                  href={dialable ? telHref(number) : undefined}
                  aria-disabled={dialable ? undefined : "true"}
                >
                  <Phone aria-hidden /> Call
                </a>
                <button
                  type="button"
                  className={styles.secondary}
                  aria-label="Delete last character"
                  onClick={() => setNumber((current) => current.slice(0, -1))}
                >
                  <Delete aria-hidden />
                </button>
              </div>
              <p className={styles.status} role="status">
                {dialable ? "Opens your phone dialer." : "Enter a number to call."}
              </p>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  subtitle,
  tone,
  icon,
  href,
  linkLabel,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  tone: ModuleTone;
  icon: ReactNode;
  href: string;
  linkLabel: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <article className={cn(styles.summary, open && styles.summaryOpen)}>
      <button
        type="button"
        className={cn(styles.summaryHead, styles[MODULE_TONE[tone]])}
        aria-expanded={open}
        onClick={onToggle}
      >
        {icon}
        <span className={styles.summaryCopy}>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>
        <ChevronRight className={cn(styles.chevron, open && styles.chevronOpen)} aria-hidden />
      </button>
      {open ? (
        <div className={styles.summaryPanel}>
          {children}
          <div className={styles.summaryFoot}>
            <Link href={href}>
              {linkLabel}
              <ChevronRight aria-hidden />
            </Link>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ResultList({
  rows,
  empty,
}: {
  rows: Array<{ key: string; href: string; title: string; detail: string }>;
  empty: string;
}) {
  if (rows.length === 0) return <p className={styles.summaryEmpty}>{empty}</p>;
  return (
    <ul className={styles.summaryRows}>
      {rows.map((row) => (
        <li key={row.key}>
          <Link href={row.href}>{row.title}</Link>
          <small>{row.detail}</small>
        </li>
      ))}
    </ul>
  );
}
