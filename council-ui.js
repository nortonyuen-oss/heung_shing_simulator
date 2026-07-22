let selectedCouncilOfficialId = 'chief_executive';
let selectedCouncilPolicyId = 'cleanAir';
let selectedCouncilResolutionId = 'cashHandout';
let selectedCouncilItemType = 'policy';

function getCouncilOfficialDisplayName(official) {
  return city.council?.customNames?.[official.id] || t(official.nameKey);
}

function getCouncilRoleLabel(role) {
  return t(`council.role.${role}`);
}

function setCouncilOfficialCustomName(officialId, value) {
  const official = getCouncilOfficialDefinition(officialId);
  if (!official) return false;
  city.council = normalizeCouncilState(city.council, city.activePolicies);
  const cleanName = Array.from(String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()).slice(0, 30).join('');
  if (cleanName) city.council.customNames[officialId] = cleanName;
  else delete city.council.customNames[officialId];
  updateCouncilMeetingUi();
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return true;
}

async function renameCouncilOfficial(officialId) {
  const official = getCouncilOfficialDefinition(officialId);
  if (!official) return;
  const currentName = getCouncilOfficialDisplayName(official);
  const promptText = t('council.renamePrompt', { role: t(official.titleKey) });
  const value = typeof showTextPromptDialog === 'function'
    ? await showTextPromptDialog(promptText, currentName)
    : window.prompt(promptText, currentName);
  if (value === null) return;
  setCouncilOfficialCustomName(officialId, value);
  const displayName = getCouncilOfficialDisplayName(official);
  if (typeof showToast === 'function') {
    showToast(value.trim() ? t('council.renameSaved', { name: displayName }) : t('council.renameReset'), 'info');
  }
}

function renderCouncilRoster() {
  const roster = document.getElementById('council-roster');
  if (!roster) return;
  if (!getCouncilOfficialDefinition(selectedCouncilOfficialId)) {
    selectedCouncilOfficialId = COUNCIL_OFFICIAL_IDS[0];
  }

  roster.replaceChildren(...COUNCIL_OFFICIAL_DEFS.map((official) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'council-person-card';
    button.classList.toggle('is-selected', official.id === selectedCouncilOfficialId);
    button.dataset.officialId = official.id;
    button.setAttribute('aria-pressed', String(official.id === selectedCouncilOfficialId));

    const portrait = document.createElement('img');
    portrait.src = official.portrait;
    portrait.alt = '';
    const name = document.createElement('span');
    name.className = 'council-person-card-name';
    name.textContent = getCouncilOfficialDisplayName(official);
    const role = document.createElement('span');
    role.className = 'council-person-card-role';
    role.textContent = getCouncilRoleLabel(official.role);
    button.append(portrait, name, role);
    return button;
  }));
}

function renderCouncilOfficialDetail() {
  const detail = document.getElementById('council-person-detail');
  const official = getCouncilOfficialDefinition(selectedCouncilOfficialId);
  if (!detail || !official) return;
  detail.replaceChildren();

  const head = document.createElement('div');
  head.className = 'council-detail-head';
  const portrait = document.createElement('img');
  portrait.src = official.portrait;
  portrait.alt = '';
  const identity = document.createElement('div');
  const name = document.createElement('h3');
  name.className = 'council-detail-name';
  name.textContent = getCouncilOfficialDisplayName(official);
  const title = document.createElement('div');
  title.className = 'council-detail-title';
  title.textContent = t(official.titleKey);
  const badge = document.createElement('span');
  badge.className = 'council-role-badge';
  badge.textContent = getCouncilRoleLabel(official.role);
  const renameButton = document.createElement('button');
  renameButton.type = 'button';
  renameButton.className = 'council-rename-btn';
  renameButton.dataset.renameOfficialId = official.id;
  renameButton.textContent = `✎ ${t('council.rename')}`;
  identity.append(name, title, badge, document.createElement('br'), renameButton);

  if (hasBuildingType('legislative_council')) {
    const profileButton = document.createElement('button');
    profileButton.type = 'button';
    profileButton.className = 'council-rename-btn';
    profileButton.dataset.profileOfficialId = official.id;
    profileButton.textContent = `📰 ${t('council.profile.featureButton')}`;
    identity.appendChild(profileButton);
  }
  head.append(portrait, identity);

  const belief = document.createElement('blockquote');
  belief.className = 'council-belief';
  belief.textContent = `“${t(official.coreBeliefKey)}”`;
  const focusLabel = document.createElement('div');
  focusLabel.className = 'council-focus-label';
  focusLabel.textContent = t('council.focusAreas');
  const focusList = document.createElement('div');
  focusList.className = 'council-focus-list';
  official.expertise.forEach((issueId) => {
    const chip = document.createElement('span');
    chip.className = 'council-focus-chip';
    chip.textContent = t(`council.issue.${issueId}`);
    focusList.appendChild(chip);
  });
  const councilBuilt = hasBuildingType('legislative_council');
  const comment = councilBuilt && typeof getCurrentCouncilComment === 'function'
    ? getCurrentCouncilComment(official.id)
    : null;
  const opinion = document.createElement('section');
  opinion.className = 'council-opinion';
  opinion.dataset.stance = comment?.stance ?? 'neutral';
  const opinionHead = document.createElement('div');
  opinionHead.className = 'council-opinion-head';
  const opinionTitle = document.createElement('span');
  opinionTitle.className = 'council-opinion-title';
  opinionTitle.textContent = t('council.currentOpinion');
  const opinionBadge = document.createElement('span');
  opinionBadge.className = 'council-opinion-badge';
  opinionBadge.textContent = t(`council.stance.${comment?.stance ?? 'neutral'}`);
  opinionHead.append(opinionTitle, opinionBadge);
  const opinionText = document.createElement('div');
  opinionText.className = 'council-opinion-text';
  opinionText.textContent = !councilBuilt
    ? t('council.opinionsLocked')
    : (comment ? `“${t(comment.messageKey, comment.params)}”` : t('council.noOpinion'));
  const opinionReason = document.createElement('div');
  opinionReason.className = 'council-opinion-reason';
  opinionReason.textContent = comment
    ? `${t(`council.issue.${comment.issueId}`)} · ${t('council.currentData')}`
    : '';
  if (!councilBuilt) opinionBadge.hidden = true;
  opinion.append(opinionHead, opinionText, opinionReason);
  const note = document.createElement('div');
  note.className = 'council-meeting-note';
  note.textContent = t('council.phaseNote');
  detail.append(head, belief, focusLabel, focusList, opinion, note);
}

function getCouncilPolicyAvailabilityText(preview) {
  if (preview.active) return t('council.policy.statusActive');
  if (!hasBuildingType('legislative_council')) return t('council.policy.needsCouncil');
  if (preview.policy.unlockPopulation && city.population < preview.policy.unlockPopulation) {
    return t('council.policy.needsPopulation', { value: preview.policy.unlockPopulation.toLocaleString() });
  }
  return t('council.policy.statusAvailable');
}

function createCouncilPreviewPersonRow(officialId, stance, reasonText, rowClass) {
  const official = getCouncilOfficialDefinition(officialId);
  const row = document.createElement('div');
  row.className = rowClass;
  const portrait = document.createElement('img');
  portrait.src = official?.portrait ?? '';
  portrait.alt = '';
  const copy = document.createElement('div');
  const name = document.createElement('span');
  name.className = 'council-preview-name';
  name.textContent = official ? getCouncilOfficialDisplayName(official) : officialId;
  const reason = document.createElement('span');
  reason.className = 'council-preview-reason';
  reason.textContent = reasonText;
  copy.append(name, reason);
  const badge = document.createElement('span');
  badge.className = 'council-position-badge';
  badge.dataset.stance = stance;
  badge.textContent = t(`council.policyStance.${stance}`);
  row.append(portrait, copy, badge);
  return row;
}

const COUNCIL_LAW_CATEGORY_ICONS = Object.freeze({
  financeEconomy: '💰',
  safetyTransport: '🚓',
  environmentPlanning: '🌳',
  educationScience: '🎓',
  socialWelfare: '❤️',
  governanceReform: '🏛️',
});

// Which accordion groups are expanded — persists across re-renders so a group the
// player opened manually stays open; the group holding the current selection is
// always forced open so the highlighted row is never hidden inside a collapsed group.
let expandedCouncilLawGroups = null;

function buildCouncilLawGroups() {
  const isVisible = (definition, itemType) => {
    if (!definition.hideUntilBuildingRequirements) return true;
    if (itemType === 'policy' && isPolicyActive(definition.id)) return true;
    return !getMissingCouncilBuildingRequirement(definition);
  };
  const groups = CITY_POLICY_CATEGORY_IDS.map((categoryId) => ({
    id: categoryId,
    label: t(`council.category.${categoryId}`),
    icon: COUNCIL_LAW_CATEGORY_ICONS[categoryId] || '📜',
    items: CITY_POLICY_DEFS
      .filter((policy) => policy.category === categoryId && isVisible(policy, 'policy'))
      .map((policy) => ({ type: 'policy', id: policy.id, def: policy })),
  }));
  groups.push({
    id: 'resolutions',
    label: t('council.resolutions.heading'),
    icon: '🎪',
    items: COUNCIL_RESOLUTION_DEFS
      .filter((resolution) => isVisible(resolution, 'resolution'))
      .map((resolution) => ({ type: 'resolution', id: resolution.id, def: resolution })),
  });
  return groups;
}

function buildCouncilLawRow(item) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'bill-row';
  button.title = t(item.def.descKey);
  if (item.type === 'policy') button.dataset.policyId = item.id;
  else button.dataset.resolutionId = item.id;

  const moverId = item.type === 'policy' ? item.def.moverId : item.def.leadOfficialIds?.[0];
  const mover = moverId ? getCouncilOfficialDefinition(moverId) : null;
  const chip = document.createElement('img');
  chip.className = 'mover-chip';
  chip.src = mover?.portrait || '';
  chip.alt = '';

  const title = document.createElement('span');
  title.className = 'bill-row-title';
  title.textContent = t(item.def.titleKey);

  const cost = document.createElement('span');
  cost.className = 'bill-row-cost';
  cost.textContent = item.type === 'policy'
    ? t('council.policy.perMonthShort', { value: councilMoney(getCouncilPolicyEstimatedMonthlyCost(item.id)) })
    : t('council.resolution.oneOff');

  button.append(chip, title, cost);
  return button;
}

function renderCouncilLawsList() {
  const container = document.getElementById('council-policy-list');
  if (!container) return;
  const groups = buildCouncilLawGroups();
  const activeGroupId = selectedCouncilItemType === 'resolution'
    ? 'resolutions'
    : getCouncilPolicyDefinition(selectedCouncilPolicyId)?.category;
  if (!expandedCouncilLawGroups) expandedCouncilLawGroups = new Set(activeGroupId ? [activeGroupId] : []);
  else if (activeGroupId) expandedCouncilLawGroups.add(activeGroupId);

  container.replaceChildren(...groups.map((group) => {
    const wrap = document.createElement('div');
    wrap.className = 'bill-group';
    wrap.classList.toggle('is-open', expandedCouncilLawGroups.has(group.id));

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'bill-group-head';
    head.dataset.billGroupToggle = group.id;
    const chevron = document.createElement('span'); chevron.className = 'chevron'; chevron.textContent = '▶';
    const icon = document.createElement('span'); icon.className = 'bill-group-icon'; icon.textContent = group.icon;
    const title = document.createElement('span'); title.className = 'bill-group-title'; title.textContent = group.label;
    const count = document.createElement('span'); count.className = 'bill-group-count'; count.textContent = String(group.items.length);
    head.append(chevron, icon, title, count);

    const list = document.createElement('div');
    list.className = 'bill-group-list';
    list.append(...group.items.map(buildCouncilLawRow));

    wrap.append(head, list);
    return wrap;
  }));
}

function toggleCouncilLawGroup(groupId) {
  if (!expandedCouncilLawGroups) expandedCouncilLawGroups = new Set();
  if (expandedCouncilLawGroups.has(groupId)) expandedCouncilLawGroups.delete(groupId);
  else expandedCouncilLawGroups.add(groupId);
  renderCouncilLawsList();
}

// The chamber's "podium" header: chamber-photo backdrop, the mover's portrait, and the
// bill's category/title/mover line. Shared by the policy and resolution detail views.
function buildCouncilPodiumBand(categoryLabel, titleText, moverId) {
  const mover = moverId ? getCouncilOfficialDefinition(moverId) : null;
  const band = document.createElement('div');
  band.className = 'podium-band';
  band.style.backgroundImage = "url('UI/legislativeCouncil/councilChamber02.png')";

  const row = document.createElement('div');
  row.className = 'podium-row';
  const avatar = document.createElement('img');
  avatar.className = 'podium-avatar';
  avatar.src = mover?.portrait || '';
  avatar.alt = '';
  const copy = document.createElement('div');
  copy.className = 'podium-copy';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'category-eyebrow';
  eyebrow.textContent = categoryLabel;
  const heading = document.createElement('h3');
  heading.className = 'council-policy-title';
  heading.textContent = titleText;
  const moverLine = document.createElement('p');
  moverLine.className = 'mover-line';
  if (mover) {
    const strong = document.createElement('b');
    strong.textContent = getCouncilOfficialDisplayName(mover);
    moverLine.append(t('council.policy.moverPrefix'), strong, t('council.policy.moverSuffix'));
  }
  copy.append(eyebrow, heading, moverLine);
  row.append(avatar, copy);
  band.append(row);
  return band;
}

function renderCouncilPolicyDetail() {
  const detail = document.getElementById('council-policy-detail');
  if (!detail || typeof getCouncilPolicyPreview !== 'function') return;
  if (city.council?.activeSession) {
    renderCouncilSessionDetail(detail);
    return;
  }
  if (selectedCouncilItemType === 'resolution') {
    renderCouncilResolutionDetail(detail);
    return;
  }
  if (!getCouncilPolicyDefinition(selectedCouncilPolicyId)) selectedCouncilPolicyId = CITY_POLICY_DEFS[0]?.id;
  const preview = getCouncilPolicyPreview(selectedCouncilPolicyId);
  if (!preview) return;
  detail.replaceChildren();

  document.querySelectorAll('[data-policy-id]').forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.policyId === selectedCouncilPolicyId);
  });
  document.querySelectorAll('[data-resolution-id]').forEach((button) => button.classList.remove('is-selected'));

  const podium = buildCouncilPodiumBand(
    t(`council.category.${preview.policy.category}`),
    t(preview.policy.titleKey),
    preview.policy.moverId,
  );
  const desc = document.createElement('p');
  desc.className = 'council-policy-desc';
  desc.textContent = t(preview.policy.descKey);

  const facts = document.createElement('div');
  facts.className = 'council-policy-facts';
  [
    [t('council.policy.monthlyCost'), councilMoney(preview.cost)],
    [t('council.policy.currentNet'), councilMoney(preview.currentNet)],
    [t('council.policy.projectedNet'), councilMoney(preview.projectedNet)],
  ].forEach(([labelText, valueText]) => {
    const fact = document.createElement('div');
    fact.className = 'council-policy-fact';
    const label = document.createElement('span');
    label.textContent = labelText;
    const value = document.createElement('strong');
    value.textContent = valueText;
    value.classList.toggle('budget-negative', String(valueText).includes('-'));
    fact.append(label, value);
    facts.appendChild(fact);
  });

  const status = document.createElement('div');
  status.className = 'council-meeting-note';
  status.textContent = getCouncilPolicyAvailabilityText(preview);

  const advisorTitle = document.createElement('div');
  advisorTitle.className = 'council-policy-section-title';
  advisorTitle.textContent = t('council.policy.advisorOpinions');
  const advisorList = document.createElement('div');
  advisorList.className = 'council-advice-list';
  preview.advisors.forEach((advice) => {
    advisorList.appendChild(createCouncilPreviewPersonRow(
      advice.officialId,
      advice.stance,
      t(advice.messageKey, advice.params),
      'council-advice-row',
    ));
  });

  const positionTitle = document.createElement('div');
  positionTitle.className = 'council-policy-section-title';
  positionTitle.textContent = t('council.policy.initialPositions');
  const positionList = document.createElement('div');
  positionList.className = 'council-position-list';
  preview.positions.forEach((position) => {
    positionList.appendChild(createCouncilPreviewPersonRow(
      position.officialId,
      position.stance,
      t(`council.policyPosition.${position.officialId}.${position.stance}`, {
        policy: t(preview.policy.titleKey),
        cost: councilMoney(preview.cost),
      }),
      'council-position-row',
    ));
  });

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'council-policy-action';
  action.dataset.councilPolicyAction = preview.policy.id;
  const motionAvailability = getCouncilMotionAvailability('policy', preview.policy.id, preview.active ? 'repeal' : 'enact');
  action.disabled = !motionAvailability.available;
  action.textContent = preview.active ? t('council.policy.proposeRepeal') : t('council.policy.proposeEnact');
  const actionNote = document.createElement('div');
  actionNote.className = 'council-policy-action-note';
  actionNote.textContent = motionAvailability.available
    ? t('council.policy.voteRequiredNote')
    : t(`council.availability.${motionAvailability.reason}`);
  detail.append(podium, desc, facts, status, advisorTitle, advisorList, positionTitle, positionList, action, actionNote);
}

function appendCouncilMotionPositions(container, positions) {
  positions.forEach((position) => {
    container.appendChild(createCouncilPreviewPersonRow(
      position.officialId,
      position.stance,
      t(`council.voteReason.${position.reasonCode}`),
      'council-position-row',
    ));
  });
}

function getCouncilMotionAvailabilityText(availability) {
  return t(`council.availability.${availability.reason}`, {
    count: Number(availability.threshold || 0).toLocaleString(),
    amount: councilMoney(Number(availability.threshold || 0)),
    value: Number(availability.threshold || 0),
    current: Number(availability.current || 0).toLocaleString(),
  });
}

function renderCouncilResolutionDetail(detail) {
  const definition = getCouncilResolutionDefinition(selectedCouncilResolutionId);
  if (!definition) return;
  detail.replaceChildren();
  document.querySelectorAll('[data-policy-id]').forEach((button) => button.classList.remove('is-selected'));
  document.querySelectorAll('[data-resolution-id]').forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.resolutionId === selectedCouncilResolutionId);
  });

  const podium = buildCouncilPodiumBand(
    t('council.resolutions.heading'),
    t(definition.titleKey),
    definition.leadOfficialIds?.[0],
  );
  const desc = document.createElement('p');
  desc.className = 'council-policy-desc';
  desc.textContent = t(definition.descKey);
  const facts = document.createElement('div');
  facts.className = 'council-policy-facts';
  const factRows = [
    [t('council.resolution.upfrontCost'), councilMoney(getCouncilResolutionUpfrontCost(definition.id))],
    [t('council.resolution.duration'), t('council.monthCount', { count: definition.durationMonths })],
    [t('council.resolution.cooldown'), t('council.monthCount', { count: definition.cooldownMonths })],
  ];
  if (definition.unlockPopulation) factRows.push([
    t('council.resolution.populationRequirement'),
    Number(definition.unlockPopulation).toLocaleString(),
  ]);
  if (definition.minimumMonthlyIncome) factRows.push([
    t('council.resolution.incomeRequirement'),
    councilMoney(definition.minimumMonthlyIncome),
  ]);
  if (definition.minimumMonthlySurplus) factRows.push([
    t('council.resolution.surplusRequirement'),
    councilMoney(definition.minimumMonthlySurplus),
  ]);
  if (definition.minimumEconomyIndex) factRows.push([
    t('council.resolution.economyRequirement'),
    String(definition.minimumEconomyIndex),
  ]);
  factRows.forEach(([labelText, valueText]) => {
    const fact = document.createElement('div');
    fact.className = 'council-policy-fact';
    const label = document.createElement('span'); label.textContent = labelText;
    const value = document.createElement('strong'); value.textContent = valueText;
    fact.append(label, value); facts.appendChild(fact);
  });

  const preview = buildCouncilMotionPreview('resolution', definition.id, 'resolution', `preview:${city.tick}`);
  const prediction = document.createElement('div');
  prediction.className = 'council-meeting-note';
  prediction.textContent = t('council.predictedVotes', { min: preview.predictedYesMin, max: preview.predictedYesMax });
  const positionList = document.createElement('div');
  positionList.className = 'council-position-list';
  appendCouncilMotionPositions(positionList, preview.positions);
  const availability = getCouncilMotionAvailability('resolution', definition.id, 'resolution');
  const action = document.createElement('button');
  action.type = 'button'; action.className = 'council-policy-action';
  action.dataset.councilResolutionAction = definition.id;
  action.disabled = !availability.available;
  action.textContent = t('council.resolution.propose');
  const note = document.createElement('div');
  note.className = 'council-policy-action-note';
  note.textContent = getCouncilMotionAvailabilityText(availability);
  detail.append(podium, desc, facts, prediction, positionList, action, note);
}

function getCouncilItemMoverId(itemType, itemId) {
  const definition = getCouncilItemDefinition(itemType, itemId);
  if (!definition) return null;
  return itemType === 'resolution' ? definition.leadOfficialIds?.[0] : definition.moverId;
}

function getCouncilItemCategoryLabel(itemType, itemId) {
  if (itemType === 'resolution') return t('council.resolutions.heading');
  const policy = getCouncilPolicyDefinition(itemId);
  return policy ? t(`council.category.${policy.category}`) : '';
}

function buildCouncilStageStepper(stage) {
  const steps = [
    { id: 'draft', label: t('council.session.stage.draft') },
    { id: 'decided', label: stage === 'executive' ? t('council.session.stage.executive') : t('council.session.stage.result') },
  ];
  const currentIndex = stage === 'draft' ? 0 : 1;
  const stepper = document.createElement('div');
  stepper.className = 'council-stage-stepper';
  steps.forEach((step, index) => {
    const pill = document.createElement('span');
    pill.className = 'council-stage-step';
    if (index === currentIndex) pill.classList.add('is-current');
    else if (index < currentIndex) pill.classList.add('is-done');
    pill.textContent = step.label;
    stepper.appendChild(pill);
  });
  return stepper;
}

function renderCouncilSessionDetail(detail) {
  const session = city.council?.activeSession;
  if (!session) return;
  detail.replaceChildren();
  const podium = buildCouncilPodiumBand(
    getCouncilItemCategoryLabel(session.itemType, session.itemId),
    t(getCouncilItemTitleKey(session.itemType, session.itemId)),
    getCouncilItemMoverId(session.itemType, session.itemId),
  );
  const stepper = buildCouncilStageStepper(session.stage);
  detail.append(podium, stepper);

  if (session.stage === 'draft') {
    const preview = buildCouncilMotionPreview(session.itemType, session.itemId, session.motion, session.seed);
    const prediction = document.createElement('div');
    prediction.className = 'council-policy-section-title';
    prediction.textContent = t('council.predictedVotes', { min: preview.predictedYesMin, max: preview.predictedYesMax });
    const advisors = document.createElement('div');
    advisors.className = 'council-advice-list';
    preview.advisors.forEach((officialId) => {
      const comment = getCurrentCouncilComment(officialId);
      advisors.appendChild(createCouncilPreviewPersonRow(
        officialId,
        comment?.stance === 'neutral' ? 'reserve' : (comment?.stance || 'reserve'),
        comment ? t(comment.messageKey, comment.params) : t('council.noOpinion'),
        'council-advice-row',
      ));
    });
    const positions = document.createElement('div');
    positions.className = 'council-position-list';
    appendCouncilMotionPositions(positions, preview.positions);
    const voteButton = document.createElement('button');
    voteButton.type = 'button'; voteButton.className = 'council-policy-action';
    voteButton.dataset.councilSessionAction = 'vote';
    voteButton.textContent = t('council.session.startVote');
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button'; cancelButton.className = 'council-policy-action council-secondary-action';
    cancelButton.dataset.councilSessionAction = 'cancel';
    cancelButton.textContent = t('council.session.cancelDraft');
    detail.append(prediction, advisors, positions, voteButton, cancelButton);
    return;
  }

  const vote = session.voteSnapshot;
  if (!vote) return;
  const tally = document.createElement('div');
  tally.className = 'council-policy-facts';
  [[t('council.vote.yes'), vote.yesCount], [t('council.vote.no'), vote.noCount], [t('council.vote.result'), t(`council.vote.${vote.councilResult}`)]].forEach(([labelText, valueText]) => {
    const fact = document.createElement('div'); fact.className = 'council-policy-fact';
    const label = document.createElement('span'); label.textContent = labelText;
    const value = document.createElement('strong'); value.textContent = String(valueText);
    fact.append(label, value); tally.appendChild(fact);
  });
  const votes = document.createElement('div');
  votes.className = 'council-position-list council-vote-reveal-list';
  vote.votes.forEach((item, index) => {
    const row = createCouncilPreviewPersonRow(
      item.officialId,
      item.choice === 'yes' ? 'support' : 'oppose',
      t(`council.voteReason.${item.reasonCodes[0]}`),
      'council-position-row council-vote-reveal',
    );
    row.style.setProperty('--vote-index', index);
    votes.appendChild(row);
  });
  detail.append(tally, votes);

  if (session.stage === 'executive') {
    const approve = document.createElement('button');
    approve.type = 'button'; approve.className = 'council-policy-action';
    approve.dataset.councilSessionAction = 'approve';
    approve.textContent = t('council.session.approve');
    if (session.itemType === 'resolution') approve.disabled = city.budget < getCouncilResolutionUpfrontCost(session.itemId);
    const veto = document.createElement('button');
    veto.type = 'button'; veto.className = 'council-policy-action council-secondary-action';
    veto.dataset.councilSessionAction = 'veto';
    veto.textContent = t('council.session.veto');
    detail.append(approve, veto);
  } else {
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'council-policy-action';
    close.dataset.councilSessionAction = 'finish';
    close.textContent = t('council.session.finish');
    detail.append(close);
  }
}

function selectCouncilPolicy(policyId) {
  if (!getCouncilPolicyDefinition(policyId)) return;
  selectedCouncilItemType = 'policy';
  selectedCouncilPolicyId = policyId;
  renderCouncilPolicyDetail();
}

function selectCouncilResolution(resolutionId) {
  if (!getCouncilResolutionDefinition(resolutionId)) return;
  selectedCouncilItemType = 'resolution';
  selectedCouncilResolutionId = resolutionId;
  renderCouncilPolicyDetail();
}

function applyCouncilPolicyPreviewAction(policyId) {
  const policy = getCouncilPolicyDefinition(policyId);
  if (!policy) return false;
  normalizeCityFinanceState();
  const active = isPolicyActive(policyId);
  const result = createCouncilSession('policy', policyId, active ? 'repeal' : 'enact');
  if (!result.ok) {
    showToast(t(`council.availability.${result.reason}`), 'warning');
    return false;
  }
  updateCouncilMeetingUi();
  return true;
}

function renderCouncilHistory() {
  const container = document.getElementById('council-history');
  if (!container) return;
  container.replaceChildren();
  const records = (city.council?.voteHistory || []).slice().reverse();
  if (records.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'council-meeting-note';
    empty.textContent = t('council.history.empty');
    container.appendChild(empty);
    return;
  }
  records.forEach((record) => {
    const itemType = record.itemType || 'policy';
    const itemId = record.itemId || record.policyId;
    const card = document.createElement('article');
    card.className = 'council-history-card';
    const title = document.createElement('strong');
    title.textContent = t(getCouncilItemTitleKey(itemType, itemId));
    const date = document.createElement('span');
    date.textContent = `${record.year}/${String(record.month).padStart(2, '0')}`;
    const tally = document.createElement('span');
    tally.textContent = t('council.history.tally', { yes: record.yesCount, no: record.noCount });
    const result = document.createElement('span');
    result.textContent = t(`council.history.result.${record.result || record.councilResult}`);
    card.append(title, date, tally, result);
    container.appendChild(card);
  });
}

function updateCouncilMeetingUi() {
  renderCouncilRoster();
  renderCouncilOfficialDetail();
  renderCouncilLawsList();
  renderCouncilPolicyDetail();
  renderCouncilHistory();
}

function setupCouncilMeetingUi() {
  const win = document.getElementById('legislative-window');
  if (!win || win.dataset.councilUiReady === 'true') return;
  win.dataset.councilUiReady = 'true';

  win.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-council-tab]');
    if (tab) {
      const tabId = tab.dataset.councilTab;
      win.querySelectorAll('[data-council-tab]').forEach((button) => {
        const active = button.dataset.councilTab === tabId;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
      });
      win.querySelectorAll('[data-council-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.councilPanel !== tabId;
      });
      return;
    }

    const policyAction = event.target.closest('[data-council-policy-action]');
    if (policyAction) {
      applyCouncilPolicyPreviewAction(policyAction.dataset.councilPolicyAction);
      return;
    }

    const resolutionAction = event.target.closest('[data-council-resolution-action]');
    if (resolutionAction) {
      const result = createCouncilSession('resolution', resolutionAction.dataset.councilResolutionAction, 'resolution');
      if (!result.ok) showToast(t(`council.availability.${result.reason}`), 'warning');
      updateCouncilMeetingUi();
      return;
    }

    const sessionAction = event.target.closest('[data-council-session-action]');
    if (sessionAction) {
      const action = sessionAction.dataset.councilSessionAction;
      if (action === 'vote') startCouncilSessionVote();
      else if (action === 'cancel') cancelCouncilSession();
      else if (action === 'approve') decideCouncilSession(true);
      else if (action === 'veto') decideCouncilSession(false);
      else if (action === 'finish') finishRejectedCouncilSession();
      updateCouncilMeetingUi();
      return;
    }

    const person = event.target.closest('[data-official-id]');
    if (person) {
      selectedCouncilOfficialId = person.dataset.officialId;
      updateCouncilMeetingUi();
      return;
    }

    const resolution = event.target.closest('[data-resolution-id]');
    if (resolution) {
      selectCouncilResolution(resolution.dataset.resolutionId);
      return;
    }

    const policyRow = event.target.closest('[data-policy-id]');
    if (policyRow) {
      selectCouncilPolicy(policyRow.dataset.policyId);
      return;
    }

    const groupToggle = event.target.closest('[data-bill-group-toggle]');
    if (groupToggle) {
      toggleCouncilLawGroup(groupToggle.dataset.billGroupToggle);
      return;
    }

    const renameButton = event.target.closest('[data-rename-official-id]');
    if (renameButton) renameCouncilOfficial(renameButton.dataset.renameOfficialId);

    const profileButton = event.target.closest('[data-profile-official-id]');
    if (profileButton && typeof announceOfficialProfileNews === 'function') {
      announceOfficialProfileNews(profileButton.dataset.profileOfficialId);
    }
  });

  document.addEventListener('languagechange', updateCouncilMeetingUi);
  updateCouncilMeetingUi();
}
