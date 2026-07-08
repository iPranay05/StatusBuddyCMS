// Supabase Configuration
// Credentials are loaded from env.js (which is ignored by Git).
// If you clone this repository, copy env.example.js to env.js and fill in your keys.
const supabaseUrl = window.env?.SUPABASE_URL;
const supabaseKey = window.env?.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase configuration is missing. Please create env.js using env.example.js as a template.');
  alert('Configuration Error: env.js is missing or does not contain SUPABASE_URL and SUPABASE_KEY. Please copy env.example.js to env.js and set your values.');
}

const supabaseClient = window.supabase.createClient(supabaseUrl || '', supabaseKey || '');

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginBtn = document.getElementById('login-btn');
const loginSpinner = document.getElementById('login-spinner');
const loginBtnText = document.getElementById('login-btn-text');

const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const logoutBtn = document.getElementById('logout-btn');
const pageTitle = document.getElementById('page-title');
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');

// Globals
let currentUser = null;
let currentProfile = null;
let allCategories = [];
let allStatuses = [];
let categoryChart = null; // New chart variable
let currentPage = 1;      // Pagination
const itemsPerPage = 10;   // Pagination
let selectedStatusIds = new Set(); // Bulk actions

// Initialize
async function init() {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (session) {
    handleLoginSuccess(session.user);
  } else {
    showLoginScreen();
  }
}

// ══════════════════════════════════════════
// AUTHENTICATION
// ══════════════════════════════════════════
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  loginError.classList.add('hidden');
  loginBtn.disabled = true;
  loginSpinner.classList.remove('hidden');
  loginBtnText.textContent = 'Signing in...';

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  loginBtn.disabled = false;
  loginSpinner.classList.add('hidden');
  loginBtnText.textContent = 'Sign In';

  if (error) {
    loginError.textContent = error.message;
    loginError.classList.remove('hidden');
  } else {
    handleLoginSuccess(data.user);
  }
});

logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  showLoginScreen();
});

async function handleLoginSuccess(user) {
  currentUser = user;
  
  // Verify Admin Role
  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !profile || (profile.role !== 'admin' && profile.role !== 'editor')) {
    loginError.textContent = 'Access denied. Administrator privileges required.';
    loginError.classList.remove('hidden');
    await supabaseClient.auth.signOut();
    return;
  }

  currentProfile = profile;
  document.getElementById('sidebar-name').textContent = profile.username || 'Admin';
  document.getElementById('sidebar-avatar').textContent = (profile.username || 'A').charAt(0).toUpperCase();

  loginScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  
  loadDashboardData();
}

function showLoginScreen() {
  loginScreen.classList.remove('hidden');
  appScreen.classList.add('hidden');
}

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════
function navigateTo(pageId) {
  pages.forEach(p => p.classList.remove('active'));
  navItems.forEach(n => n.classList.remove('active'));

  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.classList.add('active');

  const targetNav = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (targetNav) {
    targetNav.classList.add('active');
    pageTitle.textContent = targetNav.textContent.trim();
  }

  if (pageId === 'dashboard') loadDashboardData();
  else if (pageId === 'statuses') loadStatuses();
  else if (pageId === 'categories') loadCategories();
  else if (pageId === 'media') loadMediaLibrary();
}

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  });
});

sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});

// ══════════════════════════════════════════
// DATA LOADING
// ══════════════════════════════════════════
async function fetchAllData() {
  const [categoriesRes, statusesRes] = await Promise.all([
    supabaseClient.from('categories').select('*').order('sort_order', { ascending: true }),
    supabaseClient.from('statuses').select('*, categories(*)').order('created_at', { ascending: false })
  ]);

  if (!categoriesRes.error) {
    allCategories = categoriesRes.data;
    populateCategoryDropdowns();
  }
  if (!statusesRes.error) {
    allStatuses = statusesRes.data;
  }

  document.getElementById('nav-badge-categories').textContent = allCategories.length;
  document.getElementById('nav-badge-statuses').textContent = allStatuses.length;
}

async function loadDashboardData() {
  await fetchAllData();

  document.getElementById('stat-total').textContent = allStatuses.length;
  document.getElementById('stat-featured').textContent = allStatuses.filter(s => s.is_featured).length;
  document.getElementById('stat-premium').textContent = allStatuses.filter(s => s.is_premium).length;
  document.getElementById('stat-categories').textContent = allCategories.length;

  const qsTotal = document.getElementById('qs-total');
  if (qsTotal) qsTotal.textContent = allStatuses.length;
  const qsFeatured = document.getElementById('qs-featured');
  if (qsFeatured) qsFeatured.textContent = allStatuses.filter(s => s.is_featured).length;
  const qsPremium = document.getElementById('qs-premium');
  if (qsPremium) qsPremium.textContent = allStatuses.filter(s => s.is_premium).length;

  // Render Chart
  renderCategoryBreakdownChart();

  const recentList = document.getElementById('recent-statuses');
  recentList.innerHTML = '';
  
  const recent = allStatuses.slice(0, 5);
  if (recent.length === 0) {
    recentList.innerHTML = '<div class="loading-row">No statuses found.</div>';
    return;
  }

  recent.forEach(status => {
    const item = document.createElement('div');
    item.className = 'recent-item';
    item.innerHTML = `
      <div class="recent-content">${status.content}</div>
      <div class="recent-meta">${status.categories?.name || 'Uncategorized'}</div>
      <div class="recent-badge ${status.is_premium ? '' : 'free'}">${status.is_premium ? 'Premium' : 'Free'}</div>
    `;
    recentList.appendChild(item);
  });
}

function populateCategoryDropdowns() {
  const filterCat = document.getElementById('filter-category');
  const fieldCat = document.getElementById('field-category');
  
  const filterVal = filterCat.value;
  const fieldVal = fieldCat.value;

  filterCat.innerHTML = '<option value="">All Categories</option>';
  fieldCat.innerHTML = '<option value="">— Select Category —</option>';

  allCategories.forEach(cat => {
    filterCat.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
    fieldCat.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
  });

  filterCat.value = filterVal;
  fieldCat.value = fieldVal;
}

// ══════════════════════════════════════════
// STATUSES PAGE
// ══════════════════════════════════════════
async function loadStatuses() {
  await fetchAllData();
  renderStatusesTable();
}

function getFilteredStatuses() {
  const searchQuery = document.getElementById('statuses-search').value.toLowerCase();
  const filterCat = document.getElementById('filter-category').value;
  const filterMedia = document.getElementById('filter-media').value;
  const filterFlags = document.getElementById('filter-flags').value;

  return allStatuses.filter(s => {
    if (searchQuery && !s.content.toLowerCase().includes(searchQuery)) return false;
    if (filterCat && s.category_id !== filterCat) return false;
    if (filterMedia && s.media_type !== filterMedia) return false;
    if (filterFlags === 'featured' && !s.is_featured) return false;
    if (filterFlags === 'premium' && !s.is_premium) return false;
    if (filterFlags === 'free' && s.is_premium) return false;
    return true;
  });
}

function renderStatusesTable() {
  const tbody = document.getElementById('statuses-tbody');
  const filtered = getFilteredStatuses();

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="loading-cell">No statuses found matching filters.</td></tr>';
    document.getElementById('pagination-info').textContent = `0 statuses`;
    document.getElementById('prev-page').disabled = true;
    document.getElementById('next-page').disabled = true;
    document.getElementById('page-indicator').textContent = 'Page 1 of 1';
    return;
  }

  // True Pagination slicing
  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  
  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginated = filtered.slice(startIdx, startIdx + itemsPerPage);

  paginated.forEach(status => {
    const isChecked = selectedStatusIds.has(status.id);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="checkbox status-cb" value="${status.id}" ${isChecked ? 'checked' : ''} onchange="toggleStatusSelection(this, '${status.id}')" /></td>
      <td>
        <div class="td-content" title="${status.content.replace(/"/g, '&quot;')}">${status.content}</div>
      </td>
      <td>
        <span class="badge badge-gray">${status.categories?.name || 'Uncategorized'}</span>
      </td>
      <td>
        <span class="badge ${status.media_type === 'video' ? 'badge-purple' : status.media_type === 'image' ? 'badge-green' : 'badge-gray'}">${status.media_type}</span>
      </td>
      <td>${status.is_featured ? '⭐ Yes' : '-'}</td>
      <td>
        <span class="badge ${status.is_premium ? 'badge-gold' : 'badge-green'}">${status.is_premium ? 'Premium' : 'Free'}</span>
      </td>
      <td>${status.likes_count || 0}</td>
      <td>${new Date(status.created_at).toLocaleDateString()}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="action-btn" onclick="editStatus('${status.id}')" title="Edit">✎</button>
          <button class="action-btn danger" onclick="confirmDeleteStatus('${status.id}')" title="Delete">🗑</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Update pagination info
  const startNum = startIdx + 1;
  const endNum = Math.min(startIdx + itemsPerPage, filtered.length);
  document.getElementById('pagination-info').textContent = `Showing ${startNum}-${endNum} of ${filtered.length} statuses`;
  document.getElementById('page-indicator').textContent = `Page ${currentPage} of ${totalPages}`;
  document.getElementById('prev-page').disabled = currentPage === 1;
  document.getElementById('next-page').disabled = currentPage === totalPages;

  updateSelectAllCheckboxState();
}

// Bind search and filter change listeners, resetting to page 1
const filterInputs = ['statuses-search', 'filter-category', 'filter-media', 'filter-flags'];
filterInputs.forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', () => {
      currentPage = 1;
      renderStatusesTable();
    });
    el.addEventListener('change', () => {
      currentPage = 1;
      renderStatusesTable();
    });
  }
});

// ══════════════════════════════════════════
// UPLOAD STATUS PAGE
// ══════════════════════════════════════════
const statusForm = document.getElementById('status-form');
const fieldContent = document.getElementById('field-content');
const charCount = document.getElementById('char-count');

fieldContent.addEventListener('input', () => {
  charCount.textContent = fieldContent.value.length;
  if (fieldContent.value.length > 200) {
    charCount.style.color = 'var(--red)';
  } else {
    charCount.style.color = 'var(--text2)';
  }
});

document.getElementById('field-media-type').addEventListener('change', (e) => {
  const urlGroup = document.getElementById('media-url-group');
  if (e.target.value === 'text') {
    urlGroup.classList.add('hidden');
    document.getElementById('field-image-url').value = '';
    document.getElementById('media-preview').classList.add('hidden');
  } else {
    urlGroup.classList.remove('hidden');
  }
});

document.getElementById('field-image-url').addEventListener('input', (e) => {
  updateMediaPreview(e.target.value, document.getElementById('field-media-type').value);
});

function updateMediaPreview(url, type) {
  const previewBox = document.getElementById('media-preview');
  const img = document.getElementById('preview-img');
  const vid = document.getElementById('preview-video');

  if (!url) {
    previewBox.classList.add('hidden');
    return;
  }

  previewBox.classList.remove('hidden');
  if (type === 'image') {
    img.src = url;
    img.classList.remove('hidden');
    vid.classList.add('hidden');
    vid.pause();
  } else if (type === 'video') {
    vid.src = url;
    vid.classList.remove('hidden');
    img.classList.add('hidden');
  }
}

document.getElementById('clear-form-btn').addEventListener('click', () => {
  statusForm.reset();
  document.getElementById('edit-status-id').value = '';
  document.getElementById('upload-page-title').textContent = 'Upload New Status';
  document.getElementById('submit-btn-text').textContent = 'Publish Status';
  document.getElementById('media-url-group').classList.add('hidden');
  document.getElementById('media-preview').classList.add('hidden');
  charCount.textContent = '0';
  document.getElementById('form-error').classList.add('hidden');
  document.getElementById('form-success').classList.add('hidden');
});

statusForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = document.getElementById('edit-status-id').value;
  const content = document.getElementById('field-content').value;
  const category_id = document.getElementById('field-category').value;
  const media_type = document.getElementById('field-media-type').value;
  const media_url = document.getElementById('field-image-url').value;
  const is_featured = document.getElementById('field-featured').checked;
  const is_premium = document.getElementById('field-premium').checked;

  if (!content) return showFormError('Content is required');
  if (media_type !== 'text' && !media_url) return showFormError('Media URL is required for image/video');

  const btn = document.getElementById('submit-status-btn');
  const spinner = document.getElementById('submit-spinner');
  btn.disabled = true;
  spinner.classList.remove('hidden');

  const payload = {
    content,
    category_id: category_id || null,
    media_type,
    image_url: media_url || null,
    is_featured,
    is_premium
  };

  let res;
  if (id) {
    res = await supabaseClient.from('statuses').update(payload).eq('id', id);
  } else {
    // We add created_by on insert
    payload.created_by = currentUser.id;
    res = await supabaseClient.from('statuses').insert([payload]);
  }

  btn.disabled = false;
  spinner.classList.add('hidden');

  if (res.error) {
    showFormError(res.error.message);
  } else {
    showFormSuccess(id ? 'Status updated successfully!' : 'Status published successfully!');
    if (!id) document.getElementById('clear-form-btn').click();
    fetchAllData(); // Refresh bg data
  }
});

function showFormError(msg) {
  const el = document.getElementById('form-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  document.getElementById('form-success').classList.add('hidden');
}
function showFormSuccess(msg) {
  const el = document.getElementById('form-success');
  el.textContent = msg;
  el.classList.remove('hidden');
  document.getElementById('form-error').classList.add('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// ══════════════════════════════════════════
// CATEGORIES PAGE
// ══════════════════════════════════════════
async function loadCategories() {
  await fetchAllData();
  renderCategoriesGrid();
}

function renderCategoriesGrid() {
  const grid = document.getElementById('categories-grid');
  grid.innerHTML = '';

  allCategories.forEach(cat => {
    const card = document.createElement('div');
    card.className = 'cat-card';
    card.innerHTML = `
      <div class="cat-icon-circle" style="background:${cat.color}20; color:${cat.color}">
        ${cat.icon || '📁'}
      </div>
      <div class="cat-info">
        <div class="cat-name">${cat.name}</div>
        <div class="cat-sort">Sort: ${cat.sort_order}</div>
      </div>
      <div class="cat-actions">
        <button class="action-btn" onclick="editCategory('${cat.id}')">✎</button>
        <button class="action-btn danger" onclick="deleteCategory('${cat.id}')">🗑</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

const catFormCard = document.getElementById('category-form-card');
const catForm = document.getElementById('category-form');
const addCatBtn = document.getElementById('add-category-btn');

addCatBtn.addEventListener('click', () => {
  catForm.reset();
  document.getElementById('edit-category-id').value = '';
  document.getElementById('category-form-title').textContent = 'New Category';
  catFormCard.style.display = 'block';
  document.getElementById('cat-color-picker').value = '#6C3CE1';
  document.getElementById('cat-color').value = '#6C3CE1';
});

document.getElementById('cancel-cat-btn').addEventListener('click', () => {
  catFormCard.style.display = 'none';
});

document.getElementById('cat-color-picker').addEventListener('input', (e) => {
  document.getElementById('cat-color').value = e.target.value.toUpperCase();
});
document.getElementById('cat-color').addEventListener('input', (e) => {
  document.getElementById('cat-color-picker').value = e.target.value;
});

catForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = document.getElementById('edit-category-id').value;
  const name = document.getElementById('cat-name').value;
  const icon = document.getElementById('cat-icon').value;
  const color = document.getElementById('cat-color').value;
  const sort_order = parseInt(document.getElementById('cat-sort').value) || 0;

  const btn = document.getElementById('save-cat-btn');
  const spinner = document.getElementById('save-cat-spinner');
  btn.disabled = true;
  spinner.classList.remove('hidden');

  const payload = { name, icon, color, sort_order };

  let res;
  if (id) {
    res = await supabaseClient.from('categories').update(payload).eq('id', id);
  } else {
    res = await supabaseClient.from('categories').insert([payload]);
  }

  btn.disabled = false;
  spinner.classList.add('hidden');

  if (res.error) {
    const err = document.getElementById('cat-form-error');
    err.textContent = res.error.message;
    err.classList.remove('hidden');
  } else {
    catFormCard.style.display = 'none';
    showToast(id ? 'Category updated' : 'Category created');
    loadCategories();
  }
});

window.editCategory = (id) => {
  const cat = allCategories.find(c => c.id === id);
  if (!cat) return;
  document.getElementById('edit-category-id').value = cat.id;
  document.getElementById('cat-name').value = cat.name;
  document.getElementById('cat-icon').value = cat.icon || '';
  document.getElementById('cat-color').value = cat.color || '#6C3CE1';
  document.getElementById('cat-color-picker').value = cat.color || '#6C3CE1';
  document.getElementById('cat-sort').value = cat.sort_order;
  document.getElementById('category-form-title').textContent = 'Edit Category';
  catFormCard.style.display = 'block';
};

window.deleteCategory = async (id) => {
  openConfirmModal({
    title: 'Delete Category',
    message: 'Are you sure you want to delete this category? Statuses in this category will become uncategorized.',
    confirmText: 'Delete',
    onConfirm: async () => {
      const { error } = await supabaseClient.from('categories').delete().eq('id', id);
      if (error) {
        showToast('Error: ' + error.message, true);
      } else {
        showToast('Category deleted');
        loadCategories();
      }
    }
  });
};

// ══════════════════════════════════════════
// GLOBAL ACTIONS (Edit / Delete Status)
// ══════════════════════════════════════════
window.editStatus = (id) => {
  const status = allStatuses.find(s => s.id === id);
  if (!status) return;

  navigateTo('upload');
  
  document.getElementById('edit-status-id').value = status.id;
  document.getElementById('field-content').value = status.content;
  document.getElementById('field-category').value = status.category_id || '';
  
  const typeField = document.getElementById('field-media-type');
  typeField.value = status.media_type || 'text';
  
  const urlField = document.getElementById('field-image-url');
  urlField.value = status.image_url || '';
  
  if (status.media_type !== 'text') {
    document.getElementById('media-url-group').classList.remove('hidden');
    updateMediaPreview(status.image_url, status.media_type);
  } else {
    document.getElementById('media-url-group').classList.add('hidden');
    document.getElementById('media-preview').classList.add('hidden');
  }

  document.getElementById('field-featured').checked = status.is_featured;
  document.getElementById('field-premium').checked = status.is_premium;

  document.getElementById('upload-page-title').textContent = 'Edit Status';
  document.getElementById('submit-btn-text').textContent = 'Update Status';
};

window.confirmDeleteStatus = (id) => {
  openConfirmModal({
    title: 'Delete Status',
    message: 'Are you sure you want to delete this status? This cannot be undone.',
    confirmText: 'Delete',
    onConfirm: async () => {
      const { error } = await supabaseClient.from('statuses').delete().eq('id', id);
      if (error) {
        showToast('Failed to delete status', true);
      } else {
        showToast('Status deleted');
        loadStatuses();
      }
    }
  });
};

// ══════════════════════════════════════════
// MEDIA UPLOAD
// ══════════════════════════════════════════
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const uploadZone = document.getElementById('upload-zone');
const mediaLibrary = document.getElementById('media-library');

browseBtn.addEventListener('click', () => {
  fileInput.click();
});

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  uploadZone.addEventListener(eventName, preventDefaults, false);
});
function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

['dragenter', 'dragover'].forEach(eventName => {
  uploadZone.addEventListener(eventName, () => uploadZone.classList.add('dragover'), false);
});
['dragleave', 'drop'].forEach(eventName => {
  uploadZone.addEventListener(eventName, () => uploadZone.classList.remove('dragover'), false);
});

uploadZone.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const files = dt.files;
  handleFiles(files);
});

fileInput.addEventListener('change', function() {
  handleFiles(this.files);
});

function handleFiles(files) {
  ([...files]).forEach(uploadFile);
}

async function uploadFile(file) {
  const progressList = document.getElementById('upload-progress-list');
  const id = 'prog-' + Math.random().toString(36).substr(2, 9);
  
  const item = document.createElement('div');
  item.className = 'progress-item';
  item.id = id;
  item.innerHTML = `
    <div class="progress-item-header">
      <span>${file.name}</span>
      <span id="${id}-pct">0%</span>
    </div>
    <div class="progress-bar-wrap">
      <div class="progress-bar-fill" id="${id}-bar" style="width: 0%"></div>
    </div>
  `;
  progressList.appendChild(item);

  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
  const filePath = `uploads/${fileName}`;

  // Simple direct upload (no progress events in standard js client upload)
  document.getElementById(`${id}-pct`).textContent = 'Uploading...';
  document.getElementById(`${id}-bar`).style.width = '50%';

  const { data, error } = await supabaseClient.storage
    .from('status-media')
    .upload(filePath, file);

  if (error) {
    document.getElementById(`${id}-pct`).textContent = 'Failed';
    document.getElementById(`${id}-pct`).style.color = 'var(--red)';
    document.getElementById(`${id}-bar`).style.background = 'var(--red)';
    showToast(`Failed to upload ${file.name}`, true);
  } else {
    document.getElementById(`${id}-pct`).textContent = 'Complete';
    document.getElementById(`${id}-bar`).style.width = '100%';
    document.getElementById(`${id}-bar`).style.background = 'var(--green)';
    showToast(`${file.name} uploaded!`);
    loadMediaLibrary();
  }

  setTimeout(() => {
    item.remove();
  }, 3000);
}

document.getElementById('refresh-media-btn').addEventListener('click', loadMediaLibrary);

async function loadMediaLibrary() {
  mediaLibrary.innerHTML = '<div class="loading-row">Loading media...</div>';
  
  const { data, error } = await supabaseClient.storage.from('status-media').list('uploads', {
    limit: 100,
    offset: 0,
    sortBy: { column: 'created_at', order: 'desc' }
  });

  if (error) {
    mediaLibrary.innerHTML = '<div class="loading-row">Error loading media.</div>';
    return;
  }

  mediaLibrary.innerHTML = '';
  
  if (data.length === 0 || (data.length === 1 && data[0].name === '.emptyFolderPlaceholder')) {
    mediaLibrary.innerHTML = '<div class="loading-row" style="grid-column:1/-1">No media uploaded yet.</div>';
    return;
  }

  data.forEach(file => {
    if (file.name.startsWith('.')) return;
    
    const { data: publicUrlData } = supabaseClient.storage.from('status-media').getPublicUrl(`uploads/${file.name}`);
    const url = publicUrlData.publicUrl;
    
    const isVideo = file.metadata?.mimetype?.includes('video') || file.name.endsWith('.mp4');

    const card = document.createElement('div');
    card.className = 'media-item';
    card.innerHTML = `
      ${isVideo 
        ? `<video src="${url}#t=0.1" style="width:100%;height:100%;object-fit:cover;"></video>` 
        : `<img src="${url}" loading="lazy" />`
      }
      <div class="media-item-name">${file.name}</div>
      <div class="media-item-overlay">
        <button class="btn btn-sm btn-primary" onclick="copyToClipboard('${url}')">Copy URL</button>
      </div>
    `;
    mediaLibrary.appendChild(card);
  });
}

// ══════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = message;
  document.getElementById('toast-icon').textContent = isError ? '❌' : '✅';
  
  toast.style.borderColor = isError ? 'var(--red)' : 'var(--green)';
  
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

window.copyToClipboard = (text) => {
  navigator.clipboard.writeText(text).then(() => {
    showToast('URL copied to clipboard!');
  });
}

// ══════════════════════════════════════════
// DYNAMIC CONFIRMATION MODAL HELPER
// ══════════════════════════════════════════
function openConfirmModal({ title, message, onConfirm, confirmText = 'Delete', isDanger = true }) {
  const modal = document.getElementById('delete-modal');
  if (!modal) return;

  const titleEl = modal.querySelector('.modal-header h3');
  const msgEl = modal.querySelector('#delete-modal-msg');
  const confirmBtn = modal.querySelector('#delete-confirm-btn');
  const cancelBtn = modal.querySelector('#delete-cancel-btn');
  const closeBtn = modal.querySelector('#delete-modal-close');

  titleEl.textContent = title;
  msgEl.textContent = message;
  confirmBtn.textContent = confirmText;

  if (isDanger) {
    confirmBtn.className = 'btn btn-danger';
  } else {
    confirmBtn.className = 'btn btn-primary';
  }

  // Clone confirm button to remove existing event listeners
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

  newConfirmBtn.addEventListener('click', async () => {
    newConfirmBtn.disabled = true;
    newConfirmBtn.textContent = 'Processing...';
    await onConfirm();
    newConfirmBtn.disabled = false;
    modal.classList.add('hidden');
  });

  const closeModal = () => modal.classList.add('hidden');
  cancelBtn.onclick = closeModal;
  closeBtn.onclick = closeModal;

  modal.classList.remove('hidden');
}

// ══════════════════════════════════════════
// PAGINATION CONTROLS
// ══════════════════════════════════════════
document.getElementById('prev-page').addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    renderStatusesTable();
  }
});

document.getElementById('next-page').addEventListener('click', () => {
  const filtered = getFilteredStatuses();
  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  if (currentPage < totalPages) {
    currentPage++;
    renderStatusesTable();
  }
});

// ══════════════════════════════════════════
// BULK ACTIONS & SELECTION
// ══════════════════════════════════════════
window.toggleStatusSelection = (checkbox, id) => {
  if (checkbox.checked) {
    selectedStatusIds.add(id);
  } else {
    selectedStatusIds.delete(id);
  }
  updateSelectAllCheckboxState();
  updateBulkBarState();
};

function updateSelectAllCheckboxState() {
  const selectAllCheckbox = document.getElementById('select-all');
  if (!selectAllCheckbox) return;

  const filtered = getFilteredStatuses();
  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginated = filtered.slice(startIdx, startIdx + itemsPerPage);

  if (paginated.length === 0) {
    selectAllCheckbox.checked = false;
    return;
  }

  const allChecked = paginated.every(s => selectedStatusIds.has(s.id));
  selectAllCheckbox.checked = allChecked;
}

function updateBulkBarState() {
  const bar = document.getElementById('floating-bulk-bar');
  const countEl = document.getElementById('floating-selected-count');
  if (!bar || !countEl) return;

  if (selectedStatusIds.size > 0) {
    countEl.textContent = `${selectedStatusIds.size} ${selectedStatusIds.size === 1 ? 'status' : 'statuses'} selected`;
    bar.classList.add('show');
  } else {
    bar.classList.remove('show');
  }
}

document.getElementById('select-all').addEventListener('change', (e) => {
  const filtered = getFilteredStatuses();
  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginated = filtered.slice(startIdx, startIdx + itemsPerPage);

  if (e.target.checked) {
    paginated.forEach(s => selectedStatusIds.add(s.id));
  } else {
    paginated.forEach(s => selectedStatusIds.delete(s.id));
  }

  // Sync visual checkboxes
  const checkboxes = document.querySelectorAll('.status-cb');
  checkboxes.forEach(cb => {
    cb.checked = selectedStatusIds.has(cb.value);
  });

  updateBulkBarState();
});

document.getElementById('bulk-clear-btn').addEventListener('click', () => {
  selectedStatusIds.clear();
  const checkboxes = document.querySelectorAll('.status-cb');
  checkboxes.forEach(cb => cb.checked = false);
  const selectAll = document.getElementById('select-all');
  if (selectAll) selectAll.checked = false;
  updateBulkBarState();
});

document.getElementById('floating-bulk-delete-btn').addEventListener('click', () => {
  if (selectedStatusIds.size === 0) return;
  const idsArray = Array.from(selectedStatusIds);

  openConfirmModal({
    title: 'Delete Selected Statuses',
    message: `Are you sure you want to delete the ${idsArray.length} selected statuses? This action is permanent and cannot be undone.`,
    confirmText: `Delete ${idsArray.length} Statuses`,
    onConfirm: async () => {
      const { error } = await supabaseClient.from('statuses').delete().in('id', idsArray);
      if (error) {
        showToast('Failed to delete statuses: ' + error.message, true);
      } else {
        showToast(`Successfully deleted ${idsArray.length} statuses`);
        selectedStatusIds.clear();
        const selectAll = document.getElementById('select-all');
        if (selectAll) selectAll.checked = false;
        updateBulkBarState();
        loadStatuses();
      }
    }
  });
});

// ══════════════════════════════════════════
// CHART.JS DASHBOARD GRAPH
// ══════════════════════════════════════════
function renderCategoryBreakdownChart() {
  const ctx = document.getElementById('category-chart');
  if (!ctx) return;

  // Aggregate statuses by category name
  const catCounts = {};
  allStatuses.forEach(s => {
    const name = s.categories?.name || 'Uncategorized';
    catCounts[name] = (catCounts[name] || 0) + 1;
  });

  const labels = Object.keys(catCounts);
  const data = Object.values(catCounts);

  if (labels.length === 0) {
    ctx.style.display = 'none';
    return;
  }
  ctx.style.display = 'block';

  if (categoryChart) {
    categoryChart.destroy();
  }

  // High premium color palette matching design tokens
  const colors = [
    '#5E17EB', // var(--purple)
    '#7C3AED', // var(--purple-light)
    '#FFB800', // var(--gold)
    '#22C55E', // var(--green)
    '#3B82F6', // var(--blue)
    '#EF4444', // var(--red)
    '#EC4899', // Pink
    '#14B8A6', // Teal
    '#F59E0B', // Orange
    '#9333EA'  // Deep purple
  ];

  categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors.slice(0, labels.length),
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#9999AA',
            font: {
              family: "'Inter', sans-serif",
              size: 11,
              weight: '500'
            },
            boxWidth: 12,
            padding: 10
          }
        }
      },
      cutout: '70%'
    }
  });
}

// Run init
init();
