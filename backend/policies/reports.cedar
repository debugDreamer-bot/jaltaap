// JalTaap officer permissions for hazard reports (Cedar, AWS open source).
// Evaluated by common/authz.py on every officer action. Default is deny: anything not permitted
// below is refused, and a forbid always wins over a permit.

// Officers see and triage only their own agency's reports.
permit (
  principal in JalTaap::Group::"officers",
  action in [JalTaap::Action::"view", JalTaap::Action::"confirm", JalTaap::Action::"mark_false"],
  resource is JalTaap::Report
)
when { principal.agency == resource.agency };

// Only the owning agency can close a report, and only once it has evidence behind it
// (AI-verified photo, officer-confirmed, or several independent text reports).
permit (
  principal in JalTaap::Group::"officers",
  action == JalTaap::Action::"resolve",
  resource is JalTaap::Report
)
when {
  principal.agency == resource.agency &&
  ["verified", "confirmed", "corroborated"].contains(resource.status)
};

// Disputed ownership (71 Delhi waterlogging points in 2025): the owning agency can hand a report
// to another agency, never to itself and never to a made-up one.
permit (
  principal in JalTaap::Group::"officers",
  action == JalTaap::Action::"reassign",
  resource is JalTaap::Report
)
when {
  principal.agency == resource.agency &&
  context has to_agency && context has known_agencies &&
  context.to_agency != resource.agency &&
  context.known_agencies.contains(context.to_agency)
};

// City control rooms can read every agency's queue in their city, but change nothing.
permit (
  principal in JalTaap::Group::"control_room",
  action == JalTaap::Action::"view",
  resource is JalTaap::Report
)
when { principal.city == resource.city };

// Closed reports stay closed: nobody re-triages a resolved or false report.
forbid (
  principal,
  action in [JalTaap::Action::"confirm", JalTaap::Action::"mark_false", JalTaap::Action::"resolve", JalTaap::Action::"reassign"],
  resource is JalTaap::Report
)
when { ["resolved", "false"].contains(resource.status) };
