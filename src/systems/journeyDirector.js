import { chapterOneInterviewMission } from "../content/missions/chapterOneInterview.js?v=fresh-20260919-1748-dc37bc2d";
import { chapterOneNewShipMission } from "../content/missions/chapterOneNewShip.js?v=fresh-20260919-1748-dc37bc2d";
import { chapterOneRedWorkMission } from "../content/missions/chapterOneRedWork.js?v=fresh-20260919-1748-dc37bc2d";
import { modworksProcessorLesson } from "../content/missions/modworksProcessorLesson.js?v=fresh-20260919-1748-dc37bc2d";
import { getComponentStateIdForPanel, STARTUP_HIDDEN_PANEL_IDS } from "./componentRegistry.js?v=fresh-20260919-1748-dc37bc2d";
import { createMissionRunner } from "./missionRunner.js?v=fresh-20260919-1748-dc37bc2d";
import { runMissionActions } from "./missionActions.js?v=fresh-20260919-1748-dc37bc2d";
import { applyRuleMarkers, getRuleActions, matchesEventRule } from "./missionRules.js?v=fresh-20260919-1748-dc37bc2d";
import { GLOBAL_CONSIDERATIONS } from "../content/considerations/globalConsiderations.js?v=fresh-20260919-1748-dc37bc2d";
import { ensurePanelCondition, repairPanelCondition } from "./panelMaintenance.js?v=fresh-20260919-1748-dc37bc2d";

const MISSION_DEFINITIONS = new Map(
  [chapterOneInterviewMission, chapterOneNewShipMission, chapterOneRedWorkMission, modworksProcessorLesson].map((missionDefinition) => [missionDefinition.id, missionDefinition]),
);
// How many speakers can hold the screen at once.
const MAX_ACTIVE_MESSAGES = 3;

export function createJourneyDirector({
  state,
  game = null,
  onChange = () => {},
  offerContract = () => {},
  grantContract = () => {},
  showComponent = () => {},
  dockComponent = () => {},
  floatComponent = () => {},
  unlockHubService = () => {},
  requestAttention = () => {},
  runInspection = () => {},
  spawnPatrolIntercept = () => {},
  emergencyTow = () => {},
  payLoan = () => {},
  updatePaperworkControls = () => {},
  placePaperworkOnDesk = () => {},
  filePaperwork = () => {},
  buySalvageHull = () => {},
  openModuleBay = () => {},
  giveResource = () => {},
  damageHull = () => {},
  drainFuel = () => {},
}) {
  const journey = state.journey;
  let lastEventId = 0;
  let activeMission = createMission(chapterOneInterviewMission);

  function start() {
    showOnlyInitialComponents();

    if (journey.mission?.id && MISSION_DEFINITIONS.has(journey.mission.id)) {
      activeMission = createMission(MISSION_DEFINITIONS.get(journey.mission.id));
      onChange(journey);
      return;
    }

    activeMission.startOffer();
    onChange(journey);
  }

  // Start with no authored mission chain running.
  //
  // Explorer and campaign both enter this way, but they are not the same
  // chapter and they are emphatically not the same ship: explorer is open play
  // with every instrument fitted, campaign is a hand in a company skiff with
  // four things bolted to it. So the panel list is the caller's too — showing
  // explorer's set in campaign would hand the player a scanner, a collector and
  // a processor that its hull does not have.
  //
  // Every default here is explorer's, so that start is unchanged.
  const FREE_MODE_PANELS = ["viewport", "hull", "docking", "engine", "beacon-locator", "scanner", "miner", "collector", "processor", "cargo"];

  function startFreeMode({
    chapterId = "free", chapterName = "Free Play", episodeName = "Explorer Mode",
    panels = FREE_MODE_PANELS,
  } = {}) {
    showOnlyInitialComponents();
    // Neither start walks the mission unlock sequence that reveals panels one at
    // a time, so whatever the ship actually carries is shown at once.
    panels.forEach((id) => {
      showComponent(id);
    });
    game?.enableHubPatrol();
    journey.chapterId = chapterId;
    journey.chapterName = chapterName;
    journey.episodeName = episodeName;
    journey.mission = null;
    onChange(journey);
  }

  // Does the current mission hold the comms floor?
  //
  // Rook is conducting an interview. Sal offering a repair quote or a hub
  // hailing about paperwork on top of him does not read as a living world during
  // an induction — it reads as the game talking over itself while a new player
  // is being told which button to press. A mission can therefore declare a step
  // up to which it speaks alone; anything else is QUEUED, not dropped, so the
  // world still gets its say once the player is flying.
  function isCommsFloorHeld() {
    const missionId = journey.mission?.id;
    const definition = missionId ? MISSION_DEFINITIONS.get(missionId) : null;
    const untilStepId = definition?.exclusiveCommsUntilStepId;

    if (!untilStepId || journey.mission?.status === "completed") return false;

    return !(journey.completedStepIds ?? []).includes(untilStepId);
  }

  function acceptMission() {
    if (journey.mission?.status !== "offered") {
      return;
    }

    activeMission.accept();
    onChange(journey);
  }

  function acknowledge(role = "confirm") {
    const acknowledgement = journey.pendingAcknowledgement;
    const chosen = role === "decline" ? (acknowledgement?.decline ?? { action: "dismiss" }) : acknowledgement;

    if (!activeMission.acknowledge(role)) {
      return;
    }

    runAcknowledgementAction(chosen);

    if (role === "decline") {
      clearMessage({ acknowledged: true });
    }

    onChange(journey);
  }

  function runAcknowledgementAction(chosen) {
    if (!chosen?.action || chosen.action === "dismiss") {
      return;
    }

    if (chosen.action === "startMission") {
      startMission(chosen.missionId);
    } else if (chosen.action === "emergencyTow") {
      emergencyTow();
      clearMessage({ acknowledged: true });
    } else if (chosen.action === "payLoan") {
      payLoan(chosen.contractId, chosen.amount);
      clearMessage({ acknowledged: true });
    }
  }

  function askConfirmation(speaker, text, acknowledgement) {
    say(speaker, text, acknowledgement);
    onChange(journey);
  }

  function pressJourneyButton(role = "confirm") {
    if (journey.pendingAcknowledgement) {
      acknowledge(role);
      return;
    }

    if (role === "confirm" && journey.mission?.status === "offered") {
      acceptMission();
    }
  }

  function update() {
    const events = state.ledger.getEventsAfterId(lastEventId, { includeHidden: true });

    events.forEach((event) => {
      lastEventId = Math.max(lastEventId, event.id);

      // The mission looks first; the world's standing commentary second. Both
      // may react to one event — a beat advancing on a bloom strike does not
      // stop Rook complaining about the hull.
      const missionChanged = activeMission.handleEvent(event);
      const globalChanged = handleGlobalConsiderations(event);

      if (missionChanged || globalChanged) {
        onChange(journey);
      }
    });
  }

  // Considerations that belong to nobody's mission. Same rule matching as the
  // runner, but flagged in `globalFlags` so "once" means once ever, and held
  // to the same manners: silent behind a pending acknowledgement, silent
  // while a mission has the floor, silent when control is locked.
  function handleGlobalConsiderations(event) {
    if (isCommsFloorHeld()) return false;

    journey.globalFlags ??= {};
    const controlLocked = state.ledger.getSignal("actor.controlLocked");
    const rule = GLOBAL_CONSIDERATIONS.find(
      (candidate) => (!journey.pendingAcknowledgement || candidate.allowWhilePending)
        && (!controlLocked || candidate.allowWhileControlLocked)
        && matchesEventRule(candidate, event, { state, flags: journey.globalFlags }),
    );

    if (!rule) return false;

    const ruleActions = getRuleActions(rule, { state, flags: journey.globalFlags });
    applyRuleMarkers(rule, { state, flags: journey.globalFlags });
    runMissionActions(ruleActions, {
      state,
      actions: createMissionActions(),
      missionDefinition: null,
      goToStep: () => {},
    });
    return true;
  }

  function completeMission(missionDefinition) {
    if (journey.mission?.status === "completed") {
      return;
    }

    const elapsedSeconds = Math.round((Date.now() - journey.mission.acceptedAt) / 1000);
    const hull = Math.round(state.components.hull.integrity);
    const completion = missionDefinition.completion;
    const grade = getCompletionGrade(completion, { hull, elapsedSeconds });

    journey.mission = {
      ...journey.mission,
      status: "completed",
      objective: completion?.objective ?? "Assessment complete.",
      helpText: completion?.helpText ?? "Mission complete. You made it to Yard Exchange.",
      completedAt: Date.now(),
      elapsedSeconds,
      grade: grade?.id ?? null,
    };
    state.ledger.recordEvent(
      "mission.completed",
      {
        missionId: missionDefinition.id,
        missionName: missionDefinition.title,
        grade: grade?.id ?? null,
        hull,
        elapsedSeconds,
      },
      { visible: true },
    );
    if (completion) {
      const line = grade?.line ?? completion.line ?? null;

      if (line) {
        say(completion.speaker ?? "Journey", line, completion.acknowledgement);
      }

      if (missionDefinition.interlude) resumeFromInterlude();
      return;
    }

    if (missionDefinition.interlude) {
      resumeFromInterlude();
      return;
    }

    if (missionDefinition.nextMissionId) {
      say("Journey", "Mission complete.", {
        label: missionDefinition.nextMissionLabel ?? "Continue",
        action: "startMission",
        missionId: missionDefinition.nextMissionId,
      });
      return;
    }

    say("Journey", "Mission complete.");
  }

  // An interlude is a mission run INSIDE another: Nara's processor lesson
  // while the red run is still open, say. The running mission's journey
  // state is put aside, the interlude runs the ordinary way, and when it
  // completes the first is put back exactly as it was. The runner keeps no
  // state of its own that matters (a pending delayed transition is dropped),
  // so the resumed mission is rebuilt from the journey it left behind. The
  // stack lives on `journey`, so it survives a save.
  const INTERLUDE_FIELDS = ["mission", "currentStepId", "completedStepIds", "flags", "pendingAcknowledgement", "chapterId", "chapterName", "episodeName"];

  function startInterlude(missionId) {
    const missionDefinition = MISSION_DEFINITIONS.get(missionId);
    if (!missionDefinition) throw new Error(`Unknown mission: ${missionId}`);
    if (journey.mission?.id === missionId) return;

    journey.interludeStack ??= [];
    journey.interludeStack.push(Object.fromEntries(INTERLUDE_FIELDS.map((key) => [key, journey[key] ?? null])));
    startMission(missionId);
  }

  function resumeFromInterlude() {
    const saved = journey.interludeStack?.pop();
    if (!saved) return;

    INTERLUDE_FIELDS.forEach((key) => { journey[key] = saved[key]; });
    journey.flags ??= {};
    journey.completedStepIds ??= [];
    activeMission.destroy?.();
    const definition = saved.mission?.id ? MISSION_DEFINITIONS.get(saved.mission.id) : null;
    activeMission = definition ? createMission(definition) : createMission(chapterOneInterviewMission);
    onChange(journey);
  }

  function startMission(missionId) {
    const missionDefinition = MISSION_DEFINITIONS.get(missionId);

    if (!missionDefinition) {
      throw new Error(`Unknown mission: ${missionId}`);
    }

    journey.pendingAcknowledgement = null;
    journey.messages = [];
    activeMission.destroy?.();
    activeMission = createMission(missionDefinition);
    activeMission.startOffer();

    if (missionDefinition.autoAcceptOnStart) {
      activeMission.accept();
    }

    onChange(journey);
  }

  function unlockComponent(componentId, componentName) {
    const componentStateId = getComponentStateIdForPanel(componentId);

    if (componentStateId && state.components[componentStateId]) {
      state.components[componentStateId].installed = true;
    }

    showComponent(componentId);
    state.ledger.recordEvent(
      "component.shown",
      {
        componentId,
        componentName,
      },
      { visible: false },
    );
  }

  function showOnlyInitialComponents() {
    STARTUP_HIDDEN_PANEL_IDS.forEach((componentId) => {
      showComponent(componentId, false);
    });
  }

  // Several people can be talking at once — Rook mid-briefing while a hub
  // desk hails and Murmur points out a creature — so each SPEAKER holds one
  // line, and a new line from the same speaker replaces only their own. A
  // few speakers share the screen; past that, the oldest line that is not a
  // question makes room.
  function speakerKey(speaker = "") {
    return String(speaker).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function findMessageBySpeaker(speaker) {
    const key = speakerKey(speaker);
    return journey.messages.find((message) => speakerKey(message.speaker) === key) ?? null;
  }

  function hasRoomFor(speaker) {
    return Boolean(findMessageBySpeaker(speaker)) || journey.messages.length < MAX_ACTIVE_MESSAGES;
  }

  function say(speaker, text, acknowledgement = null, options = {}) {
    const messageId = journey.nextMessageId;
    const durationMs = options.durationMs ?? null;
    const priority = options.priority ?? 0;
    const origin = options.origin ?? "world";
    const key = speakerKey(speaker);

    journey.messages = journey.messages.filter((message) => speakerKey(message.speaker) !== key);
    journey.messages.push({
      id: messageId,
      speaker,
      text,
      priority,
      origin,
      hasAcknowledgement: Boolean(acknowledgement),
      time: Date.now(),
      expiresAt: durationMs ? Date.now() + durationMs : null,
    });
    journey.nextMessageId += 1;
    while (journey.messages.length > MAX_ACTIVE_MESSAGES) {
      const index = journey.messages.findIndex((message) => !message.hasAcknowledgement);
      journey.messages.splice(index < 0 ? 0 : index, 1);
    }
    if (acknowledgement) journey.pendingAcknowledgement = acknowledgement;

    if (durationMs && !acknowledgement && typeof globalThis.setTimeout === "function") {
      globalThis.setTimeout(() => {
        if (!journey.messages.some((message) => message.id === messageId)) return;
        journey.messages = journey.messages.filter((message) => message.id !== messageId);
        onChange(journey);
      }, durationMs);
    }

  }

  function sayAsNpc(speaker, text, acknowledgement = null, { priority = 0, origin = "world" } = {}) {
    if (journey.pendingAcknowledgement) {
      return false;
    }

    // A speaker does not overwrite their own strictly higher-priority line
    // with a lower one. Same priority (a mission beat advancing its own
    // dialogue) always replaces. Other speakers are not in the way at all.
    const current = findMessageBySpeaker(speaker);
    if (current && priority < (current.priority ?? -1)) {
      return false;
    }

    say(speaker, text, acknowledgement, {
      // Chatter is player-paced. It remains on screen until the player closes
      // it or the game action it describes resolves the beat.
      durationMs: null,
      priority,
      origin,
    });
    onChange(journey);
    return true;
  }

  // Which lines to clear. A mission beat clears the MISSION's lines (its own
  // voice), not a hub that happens to be hailing; the player's click clears
  // one speaker; answering clears the question. No arguments means the old
  // everything, which nothing should need any more.
  function clearMessage({ id = null, speaker = null, origin = null, acknowledged = false } = {}) {
    journey.messages = journey.messages.filter((message) => {
      if (id !== null) return message.id !== id;
      if (speaker !== null) return speakerKey(message.speaker) !== speakerKey(speaker);
      if (acknowledged) return !message.hasAcknowledgement;
      if (origin !== null) return (message.origin ?? "mission") !== origin;
      return false;
    });
  }

  function clearPendingAcknowledgement(action = null) {
    if (!journey.pendingAcknowledgement) {
      return false;
    }

    if (action && journey.pendingAcknowledgement.action !== action) {
      return false;
    }

    journey.pendingAcknowledgement = null;
    clearMessage({ acknowledged: true });
    onChange(journey);
    return true;
  }

  function createMission(missionDefinition) {
    return createMissionRunner({
      missionDefinition,
      state,
      actions: createMissionActions(),
    });
  }

  // One action map for the runner and for global considerations, so a line
  // of Rook's sounds the same whichever layer said it.
  function createMissionActions() {
    return {
      clearMessage: () => clearMessage({ origin: "mission" }),
      completeMission,
      offerContract: (contractId) => {
        unlockComponent("contract", "Contract");
        offerContract(contractId);
      },
      grantContract,
      hideComponent: (componentId) => showComponent(componentId, false),
      dockComponent: (componentId) => dockComponent(componentId),
      floatComponent: (componentId) => floatComponent(componentId),
      recordEvent: (...args) => state.ledger.recordEvent(...args),
      runInspection,
      // Scripted dialogue outranks the same speaker's ambient lines (a
      // clerk's window greeting is priority 60): Mako's beat line must not
      // lose to "Mako at Finance. Here to talk terms?".
      say: (speaker, text, acknowledgement) => sayAsNpc(speaker, text, acknowledgement, { priority: 100, origin: "mission" }),
      spawnPatrolIntercept,
      enableHubPatrol: () => game?.enableHubPatrol(),
      startMission,
      requestAttention,
      updatePaperworkControls,
      placePaperworkOnDesk,
      filePaperwork,
      buySalvageHull,
      openModuleBay,
      setEnginePowerLock: (isLocked) => {
        state.components.engine.powerLocked = isLocked;

        if (isLocked) {
          game?.setShipPowered(false);
        }
      },
      showComponent: unlockComponent,
      // The rack, not the hardware: the slot appears in the bay, empty.
      showEmptyRack: (componentId, componentName) => {
        const componentStateId = getComponentStateIdForPanel(componentId);
        if (componentStateId && state.components[componentStateId]) {
          state.components[componentStateId].installed = false;
        }
        showComponent(componentId);
        state.ledger.recordEvent("component.shown", { componentId, componentName, empty: true }, { visible: false });
      },
      // The engine has a game-side service routine that also clears the
      // runtime fault state (misfire latch, steering bias); every other panel
      // is just its condition record.
      serviceComponent: (componentId) => {
        if (componentId === "engine" && game?.serviceEnginePanel) {
          game.serviceEnginePanel();
          return;
        }
        const component = state.components[componentId];
        if (!component) return;
        repairPanelCondition(ensurePanelCondition(component));
      },
      startInterlude,
      giveResource,
      damageHull,
      drainFuel,
      spawnHunterNearShip: (reason) => game?.spawnHunterNearShip(reason),
      spawnPirateNearShip: (reason) => game?.spawnPirateNearShip(reason),
      unlockHubService,
      onChange: () => onChange(journey),
    };
  }

  return {
    start,
    startFreeMode,
    isCommsFloorHeld,
    startMission,
    sayAsNpc,
    askConfirmation,
    update,
    acceptMission,
    acknowledge,
    pressJourneyButton,
    clearMessage,
    clearPendingAcknowledgement,
    hasRoomFor,
  };
}

function getCompletionGrade(completion, { hull, elapsedSeconds }) {
  return completion?.grades?.find((grade) => {
    if (Number.isFinite(grade.minHull) && hull < grade.minHull) {
      return false;
    }

    if (Number.isFinite(grade.maxHull) && hull > grade.maxHull) {
      return false;
    }

    if (Number.isFinite(grade.maxElapsedSeconds) && elapsedSeconds > grade.maxElapsedSeconds) {
      return false;
    }

    if (Number.isFinite(grade.minElapsedSeconds) && elapsedSeconds < grade.minElapsedSeconds) {
      return false;
    }

    return true;
  }) ?? null;
}
