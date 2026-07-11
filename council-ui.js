let selectedCouncilOfficialId = 'chief_executive';
let selectedCouncilPolicyId = 'cleanAir';

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

function renderCouncilPolicyDetail() {
  const detail = document.getElementById('council-policy-detail');
  if (!detail || typeof getCouncilPolicyPreview !== 'function') return;
  if (!getCouncilPolicyDefinition(selectedCouncilPolicyId)) selectedCouncilPolicyId = CITY_POLICY_DEFS[0]?.id;
  const preview = getCouncilPolicyPreview(selectedCouncilPolicyId);
  if (!preview) return;
  detail.replaceChildren();

  document.querySelectorAll('[data-policy-id]').forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.policyId === selectedCouncilPolicyId);
  });

  const title = document.createElement('h3');
  title.className = 'council-policy-title';
  title.textContent = t(preview.policy.titleKey);
  const desc = document.createElement('p');
  desc.className = 'council-policy-desc';
  desc.textContent = t(preview.policy.descKey);
  const issues = document.createElement('div');
  issues.className = 'council-focus-list';
  Object.keys(preview.metadata.issues).filter((issueId) => preview.metadata.issues[issueId] > 0).forEach((issueId) => {
    const chip = document.createElement('span');
    chip.className = 'council-focus-chip';
    chip.textContent = t(`council.issue.${issueId}`);
    issues.appendChild(chip);
  });

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
  action.disabled = !preview.active && !preview.available;
  action.textContent = preview.active ? t('council.policy.repealNow') : t('council.policy.enactNow');
  const actionNote = document.createElement('div');
  actionNote.className = 'council-policy-action-note';
  actionNote.textContent = t('council.policy.temporaryActionNote');
  detail.append(title, desc, issues, facts, status, advisorTitle, advisorList, positionTitle, positionList, action, actionNote);
}

function selectCouncilPolicy(policyId) {
  if (!getCouncilPolicyDefinition(policyId)) return;
  selectedCouncilPolicyId = policyId;
  renderCouncilPolicyDetail();
}

function applyCouncilPolicyPreviewAction(policyId) {
  const policy = getCouncilPolicyDefinition(policyId);
  if (!policy) return false;
  normalizeCityFinanceState();
  const active = isPolicyActive(policyId);
  if (!active && !isPolicyAvailable(policyId)) return false;
  city.activePolicies[policyId] = !active;
  city.council = normalizeCouncilState(city.council, city.activePolicies);
  city.council.policyStates[policyId] = {
    status: city.activePolicies[policyId] ? 'active' : 'inactive',
    lastChangedTick: Math.floor(Number(city.tick) || 0),
  };
  computeHappiness(activeScene);
  updateDemand();
  showToast(t(city.activePolicies[policyId] ? 'toast.policyEnabled' : 'toast.policyDisabled', {
    policy: t(policy.titleKey),
  }), 'info');
  if (typeof announceCouncilPolicyNews === 'function') {
    announceCouncilPolicyNews(policyId, city.activePolicies[policyId] ? 'enact' : 'repeal');
  }
  updateHUD();
  if (typeof queueCityChangeAutosave === 'function') queueCityChangeAutosave();
  return true;
}

function updateCouncilMeetingUi() {
  renderCouncilRoster();
  renderCouncilOfficialDetail();
  renderCouncilPolicyDetail();
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

    const person = event.target.closest('[data-official-id]');
    if (person) {
      selectedCouncilOfficialId = person.dataset.officialId;
      updateCouncilMeetingUi();
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
