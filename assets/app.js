const STORAGE_KEY = 'roasterhyun-drink-cost-calculator-v2';
const CATEGORIES = ['커피', '우유/유제품', '시럽/소스', '파우더', '과일/청', '부자재', '디저트', '기타'];
const UNIT_LABELS = { g: 'g', ml: 'ml', ea: '개', shot: 'shot' };

const sampleData = {
  version: '2.0',
  settings: { minFactor: 120, optimalFactor: 300 },
  ingredients: [
    { id: 'ing_beans', name: '에스프레소 원두', category: '커피', unit: 'g', totalAmount: 1000, price: 22000 },
    { id: 'ing_milk', name: '우유', category: '우유/유제품', unit: 'ml', totalAmount: 1000, price: 2800 },
    { id: 'ing_vanilla', name: '바닐라 시럽', category: '시럽/소스', unit: 'ml', totalAmount: 1000, price: 12000 },
    { id: 'ing_choco', name: '초코 소스', category: '시럽/소스', unit: 'g', totalAmount: 2000, price: 18000 },
    { id: 'ing_ice', name: '얼음', category: '기타', unit: 'g', totalAmount: 10000, price: 3000 },
    { id: 'ing_cup16', name: '16oz 컵', category: '부자재', unit: 'ea', totalAmount: 1000, price: 65000 },
    { id: 'ing_lid16', name: '16oz 리드', category: '부자재', unit: 'ea', totalAmount: 1000, price: 35000 },
    { id: 'ing_straw', name: '빨대', category: '부자재', unit: 'ea', totalAmount: 1000, price: 18000 }
  ],
  recipes: [
    { id: 'rec_americano', name: '아이스 아메리카노', salePrice: 2500, minFactor: 120, optimalFactor: 300, items: [
      { ingredientId: 'ing_beans', amount: 18 }, { ingredientId: 'ing_ice', amount: 180 }, { ingredientId: 'ing_cup16', amount: 1 }, { ingredientId: 'ing_lid16', amount: 1 }, { ingredientId: 'ing_straw', amount: 1 }
    ]},
    { id: 'rec_vanilla_latte', name: '아이스 바닐라라떼', salePrice: 4500, minFactor: 120, optimalFactor: 300, items: [
      { ingredientId: 'ing_beans', amount: 18 }, { ingredientId: 'ing_milk', amount: 180 }, { ingredientId: 'ing_vanilla', amount: 25 }, { ingredientId: 'ing_ice', amount: 160 }, { ingredientId: 'ing_cup16', amount: 1 }, { ingredientId: 'ing_lid16', amount: 1 }, { ingredientId: 'ing_straw', amount: 1 }
    ]}
  ]
};

let state = loadState();
let currentRecipeId = null;
let recipeItems = [];

const $ = (id) => document.getElementById(id);

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: '2.0', settings: { minFactor: 120, optimalFactor: 300 }, ingredients: [], recipes: [] };
    const parsed = JSON.parse(raw);
    return {
      version: parsed.version || '2.0',
      settings: { minFactor: Number(parsed.settings?.minFactor || 120), optimalFactor: Number(parsed.settings?.optimalFactor || 300) },
      ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
      recipes: Array.isArray(parsed.recipes) ? parsed.recipes : []
    };
  } catch (error) {
    console.error(error);
    return { version: '2.0', settings: { minFactor: 120, optimalFactor: 300 }, ingredients: [], recipes: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
}


function normalizeKey(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function ingredientMatchKey(ingredient) {
  return [normalizeKey(ingredient.name), normalizeKey(ingredient.category || '기타'), normalizeKey(ingredient.unit || 'g')].join('|');
}

function recipeMatchKey(recipe) {
  return normalizeKey(recipe.name);
}

function deduplicateState() {
  const idRedirect = new Map();
  const ingredients = [];
  const ingredientIds = new Map();
  const ingredientKeys = new Map();

  state.ingredients.forEach((ing) => {
    if (!ing?.name) return;
    const byId = ingredientIds.get(String(ing.id));
    const byKey = ingredientKeys.get(ingredientMatchKey(ing));
    const target = byId || byKey;
    if (target) {
      idRedirect.set(String(ing.id), target.id);
      Object.assign(target, { ...ing, id: target.id });
      ingredientIds.set(String(target.id), target);
      ingredientKeys.set(ingredientMatchKey(target), target);
    } else {
      ingredients.push(ing);
      ingredientIds.set(String(ing.id), ing);
      ingredientKeys.set(ingredientMatchKey(ing), ing);
    }
  });

  state.ingredients = ingredients;
  state.recipes = state.recipes.map((recipe) => ({
    ...recipe,
    items: (recipe.items || []).map((item) => ({
      ...item,
      ingredientId: idRedirect.get(String(item.ingredientId)) || item.ingredientId
    }))
  }));

  const recipes = [];
  const recipeIds = new Map();
  const recipeKeys = new Map();
  state.recipes.forEach((recipe) => {
    if (!recipe?.name) return;
    const byId = recipeIds.get(String(recipe.id));
    const byKey = recipeKeys.get(recipeMatchKey(recipe));
    const target = byId || byKey;
    if (target) {
      Object.assign(target, { ...recipe, id: target.id });
      recipeIds.set(String(target.id), target);
      recipeKeys.set(recipeMatchKey(target), target);
    } else {
      recipes.push(recipe);
      recipeIds.set(String(recipe.id), recipe);
      recipeKeys.set(recipeMatchKey(recipe), recipe);
    }
  });
  state.recipes = recipes;
}

function mergeDataUpsert(incoming, options = {}) {
  deduplicateState();
  const settings = incoming.settings || {};
  state.settings = {
    minFactor: Number(settings.minFactor || state.settings.minFactor || 120),
    optimalFactor: Number(settings.optimalFactor || state.settings.optimalFactor || 300)
  };

  const ingredientIdMap = new Map();
  const existingIngredientIds = new Map(state.ingredients.map((ing) => [String(ing.id), ing]));
  const existingIngredientKeys = new Map(state.ingredients.map((ing) => [ingredientMatchKey(ing), ing]));
  let addedIngredients = 0;
  let updatedIngredients = 0;

  (incoming.ingredients || []).forEach((raw) => {
    const normalized = {
      id: String(raw.id || uid('ing')),
      name: String(raw.name || '').trim(),
      category: raw.category || '기타',
      unit: raw.unit || 'g',
      totalAmount: Number(raw.totalAmount) || 0,
      price: Number(raw.price) || 0
    };
    if (!normalized.name || normalized.totalAmount <= 0) return;

    const byId = existingIngredientIds.get(String(normalized.id));
    const byKey = existingIngredientKeys.get(ingredientMatchKey(normalized));
    const target = byId || byKey;

    if (target) {
      const originalId = target.id;
      Object.assign(target, { ...normalized, id: originalId });
      ingredientIdMap.set(String(raw.id), originalId);
      existingIngredientIds.set(String(originalId), target);
      existingIngredientKeys.set(ingredientMatchKey(target), target);
      updatedIngredients += 1;
    } else {
      let newId = normalized.id;
      if (existingIngredientIds.has(String(newId))) newId = uid('ing');
      const item = { ...normalized, id: newId };
      state.ingredients.push(item);
      ingredientIdMap.set(String(raw.id), newId);
      existingIngredientIds.set(String(newId), item);
      existingIngredientKeys.set(ingredientMatchKey(item), item);
      addedIngredients += 1;
    }
  });

  const existingRecipeIds = new Map(state.recipes.map((recipe) => [String(recipe.id), recipe]));
  const existingRecipeKeys = new Map(state.recipes.map((recipe) => [recipeMatchKey(recipe), recipe]));
  let addedRecipes = 0;
  let updatedRecipes = 0;

  (incoming.recipes || []).forEach((raw) => {
    const name = String(raw.name || '').trim();
    if (!name) return;
    const rawId = String(raw.id || uid('rec'));
    const items = Array.isArray(raw.items) ? raw.items
      .map((item) => ({
        ingredientId: ingredientIdMap.get(String(item.ingredientId)) || item.ingredientId,
        amount: Number(item.amount) || 0
      }))
      .filter((item) => item.ingredientId && item.amount > 0) : [];

    const normalized = {
      id: rawId,
      name,
      salePrice: Number(raw.salePrice) || 0,
      minFactor: Math.max(Number(raw.minFactor || incoming.settings?.minFactor || state.settings.minFactor || 120), 1),
      optimalFactor: Math.max(Number(raw.optimalFactor || incoming.settings?.optimalFactor || state.settings.optimalFactor || 300), 1),
      items
    };

    const byId = existingRecipeIds.get(rawId);
    const byKey = existingRecipeKeys.get(recipeMatchKey(normalized));
    const target = byId || byKey;

    if (target) {
      const originalId = target.id;
      Object.assign(target, { ...normalized, id: originalId });
      existingRecipeIds.set(String(originalId), target);
      existingRecipeKeys.set(recipeMatchKey(target), target);
      updatedRecipes += 1;
    } else {
      let newId = normalized.id;
      if (existingRecipeIds.has(String(newId))) newId = uid('rec');
      const item = { ...normalized, id: newId };
      state.recipes.push(item);
      existingRecipeIds.set(String(newId), item);
      existingRecipeKeys.set(recipeMatchKey(item), item);
      addedRecipes += 1;
    }
  });

  deduplicateState();
  return { addedIngredients, updatedIngredients, addedRecipes, updatedRecipes };
}

function money(value) {
  const n = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

function pct(value) {
  const n = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `${n.toFixed(1)}%`;
}

function unitCost(ingredient) {
  const amount = Number(ingredient.totalAmount) || 0;
  const price = Number(ingredient.price) || 0;
  if (amount <= 0) return 0;
  return price / amount;
}

function rowCost(item) {
  const ing = state.ingredients.find((x) => x.id === item.ingredientId);
  if (!ing) return 0;
  return unitCost(ing) * (Number(item.amount) || 0);
}

function calculateRecipe(items = recipeItems) {
  const cost = items.reduce((sum, item) => sum + rowCost(item), 0);
  const salePrice = Number($('salePrice').value) || 0;
  const minFactor = Math.max(Number($('minFactor').value) || 120, 1);
  const optimalFactor = Math.max(Number($('optimalFactor').value) || 300, 1);
  const minPrice = cost * (minFactor / 100);
  const optimalPrice = cost * (optimalFactor / 100);
  const actualMargin = salePrice - cost;
  return {
    cost,
    salePrice,
    minFactor,
    optimalFactor,
    minPrice,
    optimalPrice,
    minMargin: minPrice - cost,
    optimalMargin: optimalPrice - cost,
    minMarginRate: minPrice > 0 ? ((minPrice - cost) / minPrice) * 100 : 0,
    optimalMarginRate: optimalPrice > 0 ? ((optimalPrice - cost) / optimalPrice) * 100 : 0,
    actualMargin,
    actualMarginRate: salePrice > 0 ? (actualMargin / salePrice) * 100 : 0
  };
}

function recipeSummary(recipe) {
  const cost = recipe.items.reduce((sum, item) => {
    const ing = state.ingredients.find((x) => x.id === item.ingredientId);
    if (!ing) return sum;
    return sum + unitCost(ing) * (Number(item.amount) || 0);
  }, 0);
  const salePrice = Number(recipe.salePrice) || 0;
  return {
    cost,
    margin: salePrice - cost,
    marginRate: salePrice > 0 ? ((salePrice - cost) / salePrice) * 100 : 0
  };
}

function initSelectOptions() {
  const categorySelect = $('ingredientCategory');
  const filterSelect = $('categoryFilter');
  categorySelect.innerHTML = CATEGORIES.map((cat) => `<option value="${cat}">${cat}</option>`).join('');
  filterSelect.innerHTML = '<option value="all">전체 카테고리</option>' + CATEGORIES.map((cat) => `<option value="${cat}">${cat}</option>`).join('');
}

function renderIngredients() {
  const tbody = $('ingredientTable');
  const search = $('ingredientSearch').value.trim().toLowerCase();
  const filter = $('categoryFilter').value;
  const filtered = state.ingredients
    .filter((ing) => filter === 'all' || ing.category === filter)
    .filter((ing) => !search || ing.name.toLowerCase().includes(search));

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6">등록된 재료가 없습니다. 샘플을 불러오거나 직접 재료를 등록하세요.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((ing) => `
    <tr>
      <td><strong>${escapeHtml(ing.name)}</strong></td>
      <td>${escapeHtml(ing.category || '기타')}</td>
      <td>${numberFormat(ing.totalAmount)}${UNIT_LABELS[ing.unit] || ing.unit}</td>
      <td>${money(ing.price)}</td>
      <td>${unitCost(ing).toFixed(2)}원/${UNIT_LABELS[ing.unit] || ing.unit}</td>
      <td>
        <button class="icon-btn secondary" type="button" onclick="editIngredient('${ing.id}')">수정</button>
        <button class="icon-btn danger" type="button" onclick="deleteIngredient('${ing.id}')">삭제</button>
      </td>
    </tr>
  `).join('');
}

function renderRecipeRows() {
  const wrap = $('recipeRows');
  if (!recipeItems.length) addRecipeRow(false);
  wrap.innerHTML = recipeItems.map((item, index) => {
    const options = ['<option value="">재료 선택</option>'].concat(
      state.ingredients.map((ing) => `<option value="${ing.id}" ${ing.id === item.ingredientId ? 'selected' : ''}>${escapeHtml(ing.name)} · ${unitCost(ing).toFixed(2)}원/${UNIT_LABELS[ing.unit] || ing.unit}</option>`)
    ).join('');
    const ing = state.ingredients.find((x) => x.id === item.ingredientId);
    return `
      <div class="recipe-row">
        <label>재료<select data-row="${index}" data-field="ingredientId">${options}</select></label>
        <label>사용량<input data-row="${index}" data-field="amount" type="number" min="0" step="0.01" value="${item.amount || ''}" placeholder="사용량" /></label>
        <div class="cost-preview">${money(rowCost(item))}${ing ? `<br><small>${UNIT_LABELS[ing.unit] || ing.unit} 기준</small>` : ''}</div>
        <button class="icon-btn danger" type="button" onclick="removeRecipeRow(${index})">삭제</button>
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('select').forEach((el) => {
    el.addEventListener('change', (event) => {
      const row = Number(event.target.dataset.row);
      recipeItems[row].ingredientId = event.target.value;
      renderResults();
      renderRecipeRows();
    });
  });

  wrap.querySelectorAll('input[data-field="amount"]').forEach((el) => {
    el.addEventListener('input', (event) => {
      const row = Number(event.target.dataset.row);
      recipeItems[row].amount = event.target.value;
      renderResults();
      updateRecipeRowPreview(row, event.target.closest('.recipe-row'));
    });
  });
}

function updateRecipeRowPreview(index, rowEl) {
  if (!rowEl) return;
  const preview = rowEl.querySelector('.cost-preview');
  if (!preview) return;
  const item = recipeItems[index];
  const ing = state.ingredients.find((x) => x.id === item.ingredientId);
  preview.innerHTML = `${money(rowCost(item))}${ing ? `<br><small>${UNIT_LABELS[ing.unit] || ing.unit} 기준</small>` : ''}`;
}

function renderResults() {
  const result = calculateRecipe();
  $('resultCost').textContent = money(result.cost);
  $('resultMinPrice').textContent = money(result.minPrice);
  $('resultMinMargin').textContent = `마진 ${money(result.minMargin)} · ${pct(result.minMarginRate)}`;
  $('resultOptimalPrice').textContent = money(result.optimalPrice);
  $('resultOptimalMargin').textContent = `마진 ${money(result.optimalMargin)} · ${pct(result.optimalMarginRate)}`;
  $('resultActualMargin').textContent = money(result.actualMargin);
  $('resultActualMarginRate').textContent = `마진율 ${pct(result.actualMarginRate)}`;
  $('statCurrentCost').textContent = money(result.cost);
  $('statCurrentMargin').textContent = pct(result.actualMarginRate);
}

function renderRecipes() {
  const list = $('recipeList');
  if (!state.recipes.length) {
    list.innerHTML = '<div class="empty-state">저장된 레시피가 없습니다. 계산 화면에서 레시피명을 입력하고 저장해보세요.</div>';
    return;
  }

  list.innerHTML = state.recipes.map((recipe) => {
    const summary = recipeSummary(recipe);
    return `
      <article class="recipe-card">
        <h3>${escapeHtml(recipe.name)}</h3>
        <p>${recipe.items.length}개 재료 · 판매가 ${money(recipe.salePrice)}</p>
        <div class="meta">
          <span>원가 ${money(summary.cost)}</span>
          <span>마진율 ${pct(summary.marginRate)}</span>
          <span>최소 ${money(summary.cost * ((recipe.minFactor || 120) / 100))}</span>
          <span>적정 ${money(summary.cost * ((recipe.optimalFactor || 300) / 100))}</span>
        </div>
        <div class="card-actions">
          <button class="icon-btn secondary" type="button" onclick="loadRecipe('${recipe.id}')">불러오기</button>
          <button class="icon-btn secondary" type="button" onclick="copyRecipe('${recipe.id}')">복사</button>
          <button class="icon-btn danger" type="button" onclick="deleteRecipe('${recipe.id}')">삭제</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderStats() {
  $('statIngredients').textContent = `${state.ingredients.length}개`;
  $('statRecipes').textContent = `${state.recipes.length}개`;
}

function renderAll() {
  renderIngredients();
  renderRecipeRows();
  renderResults();
  renderRecipes();
  renderStats();
}

function clearIngredientForm() {
  $('ingredientId').value = '';
  $('ingredientName').value = '';
  $('ingredientCategory').value = CATEGORIES[0];
  $('ingredientUnit').value = 'g';
  $('ingredientAmount').value = '';
  $('ingredientPrice').value = '';
}

function addRecipeRow(shouldRender = true) {
  recipeItems.push({ ingredientId: '', amount: '' });
  if (shouldRender) renderAll();
}

function removeRecipeRow(index) {
  recipeItems.splice(index, 1);
  if (!recipeItems.length) recipeItems.push({ ingredientId: '', amount: '' });
  renderAll();
}

function resetRecipeForm() {
  currentRecipeId = null;
  $('recipeName').value = '';
  $('salePrice').value = '';
  $('minFactor').value = state.settings.minFactor || 120;
  $('optimalFactor').value = state.settings.optimalFactor || 300;
  recipeItems = [{ ingredientId: '', amount: '' }];
  renderAll();
}

function editIngredient(id) {
  const ing = state.ingredients.find((x) => x.id === id);
  if (!ing) return;
  $('ingredientId').value = ing.id;
  $('ingredientName').value = ing.name;
  $('ingredientCategory').value = ing.category || '기타';
  $('ingredientUnit').value = ing.unit || 'g';
  $('ingredientAmount').value = ing.totalAmount;
  $('ingredientPrice').value = ing.price;
  $('ingredientName').focus();
}

function deleteIngredient(id) {
  const used = state.recipes.some((recipe) => recipe.items.some((item) => item.ingredientId === id)) || recipeItems.some((item) => item.ingredientId === id);
  const msg = used ? '이 재료는 현재 레시피에서 사용 중입니다. 삭제하면 해당 레시피 계산에서 제외됩니다. 삭제할까요?' : '이 재료를 삭제할까요?';
  if (!confirm(msg)) return;
  state.ingredients = state.ingredients.filter((x) => x.id !== id);
  state.recipes = state.recipes.map((recipe) => ({ ...recipe, items: recipe.items.filter((item) => item.ingredientId !== id) }));
  recipeItems = recipeItems.filter((item) => item.ingredientId !== id);
  if (!recipeItems.length) recipeItems.push({ ingredientId: '', amount: '' });
  saveState();
  showToast('재료를 삭제했습니다.');
}

function loadRecipe(id) {
  const recipe = state.recipes.find((x) => x.id === id);
  if (!recipe) return;
  currentRecipeId = recipe.id;
  $('recipeName').value = recipe.name;
  $('salePrice').value = recipe.salePrice || '';
  $('minFactor').value = recipe.minFactor || state.settings.minFactor || 120;
  $('optimalFactor').value = recipe.optimalFactor || state.settings.optimalFactor || 300;
  recipeItems = recipe.items.map((item) => ({ ...item }));
  if (!recipeItems.length) recipeItems.push({ ingredientId: '', amount: '' });
  renderAll();
  window.scrollTo({ top: document.querySelector('.recipe-panel').offsetTop - 20, behavior: 'smooth' });
}

function copyRecipe(id) {
  const recipe = state.recipes.find((x) => x.id === id);
  if (!recipe) return;
  currentRecipeId = null;
  $('recipeName').value = `${recipe.name} 복사본`;
  $('salePrice').value = recipe.salePrice || '';
  $('minFactor').value = recipe.minFactor || state.settings.minFactor || 120;
  $('optimalFactor').value = recipe.optimalFactor || state.settings.optimalFactor || 300;
  recipeItems = recipe.items.map((item) => ({ ...item }));
  renderAll();
  window.scrollTo({ top: document.querySelector('.recipe-panel').offsetTop - 20, behavior: 'smooth' });
}

function deleteRecipe(id) {
  if (!confirm('저장된 레시피를 삭제할까요?')) return;
  state.recipes = state.recipes.filter((x) => x.id !== id);
  if (currentRecipeId === id) resetRecipeForm();
  saveState();
  showToast('레시피를 삭제했습니다.');
}

function saveRecipe() {
  const name = $('recipeName').value.trim();
  if (!name) {
    showToast('레시피명을 입력해주세요.');
    $('recipeName').focus();
    return;
  }
  const items = recipeItems.filter((item) => item.ingredientId && Number(item.amount) > 0);
  if (!items.length) {
    showToast('사용량이 입력된 재료가 필요합니다.');
    return;
  }
  const recipe = {
    id: currentRecipeId || uid('rec'),
    name,
    salePrice: Number($('salePrice').value) || 0,
    minFactor: Math.max(Number($('minFactor').value) || 120, 1),
    optimalFactor: Math.max(Number($('optimalFactor').value) || 300, 1),
    items
  };
  const index = state.recipes.findIndex((x) => x.id === recipe.id);
  if (index >= 0) state.recipes[index] = recipe;
  else state.recipes.push(recipe);
  currentRecipeId = recipe.id;
  state.settings.minFactor = recipe.minFactor;
  state.settings.optimalFactor = recipe.optimalFactor;
  saveState();
  showToast('레시피를 저장했습니다.');
}

function exportJson() {
  const payload = { ...state, exportedAt: new Date().toISOString() };
  downloadFile(`drink-cost-backup-${dateStamp()}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed.ingredients) || !Array.isArray(parsed.recipes)) throw new Error('invalid schema');
      const result = mergeDataUpsert(parsed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      resetRecipeForm();
      showToast(`JSON 병합 완료: 재료 ${result.addedIngredients}개 추가/${result.updatedIngredients}개 갱신, 레시피 ${result.addedRecipes}개 추가/${result.updatedRecipes}개 갱신`);
    } catch (error) {
      console.error(error);
      showToast('불러오기 실패: 올바른 백업 JSON 파일이 아닙니다.');
    }
  };
  reader.readAsText(file, 'utf-8');
}

function exportIngredientsCsv() {
  const rows = [['재료명', '카테고리', '단위', '총량', '구매가격', '단가']].concat(
    state.ingredients.map((ing) => [ing.name, ing.category, UNIT_LABELS[ing.unit] || ing.unit, ing.totalAmount, ing.price, unitCost(ing).toFixed(2)])
  );
  downloadCsv(`ingredients-${dateStamp()}.csv`, rows);
}

function exportRecipesCsv() {
  const rows = [['레시피명', '재료명', '사용량', '단위', '재료원가', '레시피원가', '판매가', '마진금액', '마진율', '최소메뉴단가', '적정메뉴단가']];
  state.recipes.forEach((recipe) => {
    const summary = recipeSummary(recipe);
    recipe.items.forEach((item) => {
      const ing = state.ingredients.find((x) => x.id === item.ingredientId);
      rows.push([
        recipe.name,
        ing ? ing.name : '(삭제된 재료)',
        item.amount,
        ing ? (UNIT_LABELS[ing.unit] || ing.unit) : '',
        rowCost(item).toFixed(2),
        summary.cost.toFixed(2),
        recipe.salePrice || 0,
        summary.margin.toFixed(2),
        summary.marginRate.toFixed(2),
        (summary.cost * ((recipe.minFactor || 120) / 100)).toFixed(2),
        (summary.cost * ((recipe.optimalFactor || 300) / 100)).toFixed(2)
      ]);
    });
  });
  downloadCsv(`recipes-${dateStamp()}.csv`, rows);
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  downloadFile(filename, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function dateStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function numberFormat(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[ch]));
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function bindEvents() {
  $('ingredientForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('ingredientName').value.trim();
    const totalAmount = Number($('ingredientAmount').value);
    const price = Number($('ingredientPrice').value);
    if (!name || totalAmount <= 0 || price < 0) {
      showToast('재료명, 총량, 구매가격을 확인해주세요.');
      return;
    }
    const id = $('ingredientId').value || uid('ing');
    const duplicate = state.ingredients.find((ing) => ing.name === name && ing.id !== id);
    if (duplicate && !confirm('같은 이름의 재료가 있습니다. 그래도 저장할까요?')) return;
    const item = { id, name, category: $('ingredientCategory').value, unit: $('ingredientUnit').value, totalAmount, price };
    const index = state.ingredients.findIndex((ing) => ing.id === id);
    if (index >= 0) state.ingredients[index] = item;
    else state.ingredients.push(item);
    clearIngredientForm();
    saveState();
    showToast('재료를 저장했습니다.');
  });

  $('btnIngredientClear').addEventListener('click', clearIngredientForm);
  $('ingredientSearch').addEventListener('input', renderIngredients);
  $('categoryFilter').addEventListener('change', renderIngredients);
  $('btnAddRecipeRow').addEventListener('click', () => addRecipeRow(true));
  $('btnClearRecipe').addEventListener('click', resetRecipeForm);
  $('btnSaveRecipe').addEventListener('click', saveRecipe);
  ['salePrice', 'minFactor', 'optimalFactor'].forEach((id) => $(id).addEventListener('input', renderResults));
  $('btnExportJson').addEventListener('click', exportJson);
  $('btnExportIngredientsCsv').addEventListener('click', exportIngredientsCsv);
  $('btnExportRecipesCsv').addEventListener('click', exportRecipesCsv);
  $('jsonImport').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) importJson(file);
    event.target.value = '';
  });
  $('btnLoadSample').addEventListener('click', () => {
    if (state.ingredients.length || state.recipes.length) {
      if (!confirm('샘플 데이터를 병합합니다. 같은 재료와 레시피는 덮어쓰고, 없는 항목만 추가합니다. 계속할까요?')) return;
    }
    const result = mergeDataUpsert(sampleData);
    saveState();
    showToast(`샘플 병합 완료: 재료 ${result.addedIngredients}개 추가/${result.updatedIngredients}개 갱신, 레시피 ${result.addedRecipes}개 추가/${result.updatedRecipes}개 갱신`);
  });
  $('btnResetAll').addEventListener('click', () => {
    if (!confirm('현재 브라우저에 저장된 재료와 레시피를 모두 삭제합니다. JSON 백업을 먼저 권장합니다. 계속할까요?')) return;
    state = { version: '2.0', settings: { minFactor: 120, optimalFactor: 300 }, ingredients: [], recipes: [] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    resetRecipeForm();
    showToast('전체 데이터를 초기화했습니다.');
  });
}

window.editIngredient = editIngredient;
window.deleteIngredient = deleteIngredient;
window.removeRecipeRow = removeRecipeRow;
window.loadRecipe = loadRecipe;
window.copyRecipe = copyRecipe;
window.deleteRecipe = deleteRecipe;

initSelectOptions();
bindEvents();
$('minFactor').value = state.settings.minFactor || 120;
$('optimalFactor').value = state.settings.optimalFactor || 300;
recipeItems = [{ ingredientId: '', amount: '' }];
renderAll();
