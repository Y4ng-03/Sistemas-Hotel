import './style.css'

const sanitize = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
};

const maskIdCard = (id) => {
  if (!id || id === 'N/A') return 'N/A';
  if (id.length <= 4) return '***';
  const prefix = id.substring(0, 2);
  const suffix = id.substring(id.length - 2);
  return `${prefix}***${suffix}`;
};

// Configuración de la API (Ruta relativa para funcionar en red local y túneles)
const API_URL = '/backend/api.php';

class HotelSystem {
  constructor() {
    this.rates = { 'Estándar': 45, 'Doble Superior': 75, 'Suite Real': 150 };
    this.currentUser = null;
    this.rooms = [];
    this.exchangeRate = parseFloat(localStorage.getItem('bcv_rate') || '36.50');
    
    this.currentFloor = 1;
    this.selectedRoom = null;
    this.activeTab = 'general';
    this.isHousekeepingMode = false;
    this.reportsChart = null;

    this.init();
    window.hotelSystem = this;
  }

  async loadData() {
    try {
      const res = await fetch(`${API_URL}?action=get_rooms`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      this.rooms = data.map(r => ({
        id: parseInt(r.id),
        number: parseInt(r.number),
        floor: parseInt(r.floor),
        status: r.status,
        type: r.type,
        rate: parseFloat(r.rate),
        notes: r.notes || '',
        checkIn: r.check_in || '',
        checkOut: r.check_out || '',
        guest: {
          name: r.guest_name || '',
          id: r.id_card || '',
          paymentMethod: r.payment_method || 'Pendiente',
          paymentStatus: r.payment_status || 'pending'
        },
        charges: r.charges.map(c => ({
          id: c.id,
          description: c.description,
          amount: parseFloat(c.amount),
          date: new Date(c.date).toLocaleString()
        }))
      }));
      
      this.renderRooms();
      this.updateStats();
    } catch (e) {
      console.error("Error cargando datos de SQL:", e);
      alert("Error conectando con la Base de Datos SQL. Asegúrate de que XAMPP esté encendido.");
    }
  }

  async logAction(action, details) {
    if (!this.currentUser) return;
    try {
      await fetch(`${API_URL}?action=log_action`, {
        method: 'POST',
        body: JSON.stringify({ user: this.currentUser.name, action, details })
      });
    } catch (e) { console.error(e); }
  }

  async fetchBCVRate() {
    const manualDate = localStorage.getItem('bcv_manual_date');
    if (manualDate === new Date().toDateString()) {
      return false; // Ya se modificó manualmente hoy, respetamos ese valor
    }
    
    try {
      const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
      const data = await res.json();
      const rate = data.promedio || data.precio || data.venta;
      if (rate && !isNaN(rate)) {
        this.exchangeRate = parseFloat(rate);
        localStorage.setItem('bcv_rate', this.exchangeRate.toString());
        this.updateBCVDisplay();
        return true;
      }
    } catch (e) { console.error('Error fetching BCV:', e); }
    return false;
  }

  updateBCVDisplay() {
    const el = document.getElementById('bcv-rate-display');
    if (el) el.textContent = this.exchangeRate.toFixed(2);
  }

  init() {
    this.setupAuth();
    this.setupEventListeners();
    this.updateBCVDisplay();
    this.fetchBCVRate();
  }

  setupAuth() {
    const session = sessionStorage.getItem('gc_session');
    if (session) { this.currentUser = JSON.parse(session); this.showDashboard(); }

    document.getElementById('login-form').onsubmit = async (e) => {
      e.preventDefault();
      const user = document.getElementById('username').value;
      const pass = document.getElementById('password').value;
      
      try {
        const res = await fetch(`${API_URL}?action=login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'login', username: user, password: pass })
        });
        const data = await res.json();
        
        if (data.success) {
          this.currentUser = data.user;
          sessionStorage.setItem('gc_session', JSON.stringify(this.currentUser));
          this.logAction('Inicio de Sesión', 'Acceso');
          this.showDashboard();
        } else {
          console.error("Login backend error:", data);
          const err = document.getElementById('login-error');
          if (data.error) err.textContent = data.error;
          err.classList.remove('hidden');
          setTimeout(() => err.classList.add('hidden'), 3000);
        }
      } catch (e) {
        console.error("Login error", e);
      }
    };

    document.getElementById('btn-logout').onclick = () => {
      this.logAction('Cierre de Sesión', 'Salida');
      sessionStorage.removeItem('gc_session');
      location.reload();
    };
  }

  showDashboard() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('user-display-name').textContent = this.currentUser.name;
    document.getElementById('user-role').textContent = this.currentUser.role === 'admin' ? 'Administrador' : 'Recepcionista';
    document.getElementById('user-avatar').textContent = this.currentUser.name.substring(0, 2);
    document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', this.currentUser.role !== 'admin'));
    this.renderFloorNav();
    this.loadData(); // Cargar datos desde SQL
    this.updateBCVDisplay();
  }

  setupEventListeners() {
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (target.closest('.modal-tab')) this.switchTab(target.closest('.modal-tab').getAttribute('data-tab'));
      if (target.id === 'btn-add-charge-v2') this.addNewCharge();
      if (target.closest('.btn-delete-charge')) this.deleteCharge(target.closest('.btn-delete-charge').dataset.id);
      if (target.closest('#btn-checkout')) this.processCheckout();
      if (target.closest('#btn-print-bill')) this.printReceipt();
      if (target.id === 'view-logs') this.showAuditLogs();
      if (target.id === 'view-reports') this.showReports();
      if (target.id === 'btn-housekeeping') this.toggleHousekeeping();
      
      if (target.id === 'btn-edit-bcv' || target.closest('#btn-edit-bcv') || target.id === 'bcv-rate-display-container' || target.closest('#bcv-rate-display-container')) {
        this.manualUpdateBCV();
      }
      if (target.id === 'btn-save-bcv') this.saveManualBCV();
      if (target.closest('#close-bcv-modal') || target.id === 'bcv-modal-overlay') {
        document.getElementById('bcv-modal').classList.add('hidden');
      }

      if (target.closest('#close-modal') || target.id === 'modal-overlay') this.hideModal();
      if (target.closest('#close-reports') || target.id === 'reports-overlay') document.getElementById('reports-modal').classList.add('hidden');

      // Dropdown changes
      if (target.id === 'payment-method') this.updateBillingView();

      // Navigation Switching
      if (target.closest('#nav-hotel')) this.switchView('hotel');
      if (target.closest('#nav-restaurant')) this.switchView('restaurant');
      if (target.closest('#nav-events')) this.switchView('events');
      if (target.closest('#nav-inventory')) this.switchView('inventory');
    });

    document.getElementById('search-room').addEventListener('input', (e) => this.renderRooms(e.target.value, document.getElementById('filter-type').value));
    document.getElementById('filter-type').addEventListener('change', (e) => this.renderRooms(document.getElementById('search-room').value, e.target.value));
    document.getElementById('room-form').onsubmit = (e) => { e.preventDefault(); this.saveRoomDetails(); };
    document.getElementById('room-status').onchange = (e) => {
      const isAvailable = e.target.value === 'available';
      const btn = document.getElementById('btn-main-action');
      if (!isAvailable) {
        btn.textContent = 'Guardar Cambios';
        btn.classList.remove('bg-green-600'); btn.classList.add('bg-blue-600');
      } else {
        btn.textContent = 'Alquilar Habitación';
        btn.classList.remove('bg-blue-600'); btn.classList.add('bg-green-600');
      }
    };

    document.getElementById('btn-export-csv').onclick = () => {
      window.location.href = `${API_URL}?action=export_seniat`;
    };
  }

  manualUpdateBCV() {
    document.getElementById('input-new-bcv').value = this.exchangeRate;
    document.getElementById('bcv-modal').classList.remove('hidden');
  }

  saveManualBCV() {
    const val = parseFloat(document.getElementById('input-new-bcv').value);
    if (val && !isNaN(val)) {
      this.exchangeRate = val;
      localStorage.setItem('bcv_rate', this.exchangeRate.toString());
      localStorage.setItem('bcv_manual_date', new Date().toDateString());
      this.updateBCVDisplay();
      this.logAction('Ajuste Tasa', `Cambio manual: Bs. ${this.exchangeRate}`);
      document.getElementById('bcv-modal').classList.add('hidden');
    }
  }

  toggleHousekeeping() {
    this.isHousekeepingMode = !this.isHousekeepingMode;
    document.getElementById('btn-housekeeping').classList.toggle('bg-yellow-500', this.isHousekeepingMode);
    document.getElementById('btn-housekeeping').classList.toggle('text-white', this.isHousekeepingMode);
    document.getElementById('current-view-title').textContent = this.isHousekeepingMode ? 'Modo Limpieza' : `Piso ${this.currentFloor}`;
    this.renderRooms();
  }

  renderFloorNav() {
    const nav = document.getElementById('floor-nav');
    nav.innerHTML = '';
    for (let i = 1; i <= 7; i++) {
      const btn = document.createElement('button');
      btn.className = `sidebar-link w-full text-xs font-bold ${this.currentFloor === i ? 'active' : ''}`;
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" /></svg> <span class="flex-1 text-left">Piso ${i}</span>`;
      btn.onclick = () => { 
        this.currentFloor = i; 
        this.renderFloorNav(); 
        this.renderRooms(); 
        document.getElementById('current-view-title').textContent = this.isHousekeepingMode ? `Limpieza - Piso ${i}` : `Piso ${i}`; 
      };
      nav.appendChild(btn);
    }
  }

  renderRooms(query = '', typeFilter = 'all') {
    const grid = document.getElementById('room-grid');
    grid.innerHTML = '';
    const filtered = this.rooms.filter(r => {
      const matchesFloor = r.floor === this.currentFloor;
      const matchesMode = this.isHousekeepingMode ? r.status === 'cleaning' : true;
      const matchesType = typeFilter === 'all' || r.type === typeFilter;
      const q = query.toLowerCase();
      const matchesSearch = r.number.toString().includes(q) || r.guest.name.toLowerCase().includes(q);
      return matchesFloor && matchesMode && matchesType && matchesSearch;
    });

    filtered.forEach(room => {
      const card = document.createElement('div');
      const meta = { available: { color: 'bg-green-500', label: 'Libre' }, occupied: { color: 'bg-red-500', label: 'Ocupada' }, cleaning: { color: 'bg-amber-500', label: 'Limpieza' }, maintenance: { color: 'bg-slate-500', label: 'Mantenimiento' } }[room.status];
      card.className = `room-card animate-fade-in bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover-lift cursor-pointer relative overflow-hidden group`;
      card.innerHTML = `
        <div class="absolute top-0 left-0 w-1 h-full ${meta.color}"></div>
        <div class="flex justify-between items-start mb-2">
          <span class="text-2xl font-black text-slate-800 tracking-tighter drop-shadow-sm group-hover:text-brand-primary transition-colors">#${room.number}</span>
          <span class="text-[9px] px-3 py-1 rounded-full ${meta.color} text-white font-black uppercase tracking-widest shadow-sm">${meta.label}</span>
        </div>
        <p class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">${room.type}</p>
        <div class="h-px bg-slate-100 w-full mb-4"></div>
        <p class="text-xs font-bold ${room.status === 'occupied' ? 'text-slate-700' : 'text-emerald-600'} truncate flex items-center gap-2">
          ${room.status === 'occupied' ? `<span class="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs">👤</span> ${sanitize(room.guest.name)}` : '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Listo para Check-in...'}
        </p>
      `;
      card.onclick = () => this.showModal(room);
      grid.appendChild(card);
    });
  }

  updateStats() {
    const occupied = this.rooms.filter(r => r.status === 'occupied');
    document.getElementById('stat-available').textContent = this.rooms.filter(r => r.status === 'available').length;
    document.getElementById('stat-occupied').textContent = occupied.length;
    if (this.currentUser && this.currentUser.role === 'admin' && document.getElementById('stat-revenue')) {
      const rev = occupied.reduce((sum, r) => sum + this.calculateTotal(r), 0);
      document.getElementById('stat-revenue').textContent = `$${rev.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }
  }
  calculateTotal(room) {
    // Intentar leer fechas del modal si el modal está abierto para esta habitación
    let checkInStr = room.checkIn;
    let checkOutStr = room.checkOut;
    
    const modal = document.getElementById('room-modal');
    if (modal && !modal.classList.contains('hidden') && this.selectedRoom?.id === room.id) {
      const inEl = document.getElementById('check-in-time');
      const outEl = document.getElementById('check-out-time');
      if (inEl && inEl.value) checkInStr = inEl.value;
      if (outEl && outEl.value) checkOutStr = outEl.value;
    }

    const dateIn = new Date(checkInStr);
    const dateOut = checkOutStr ? new Date(checkOutStr) : new Date();
    
    // Si la fecha es inválida o el cálculo falla, por defecto 1 noche
    let nights = 1;
    if (!isNaN(dateIn.getTime()) && !isNaN(dateOut.getTime())) {
      const diff = dateOut.getTime() - dateIn.getTime();
      nights = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    const chargesTotal = room.charges.reduce((sum, c) => sum + c.amount, 0);
    const subtotal = (nights * room.rate) + chargesTotal;
    const inatur = subtotal * 0.01;
    
    const isModalOpenForThisRoom = modal && !modal.classList.contains('hidden') && this.selectedRoom?.id === room.id;
    const method = isModalOpenForThisRoom ? (document.getElementById('payment-method')?.value || room.guest.paymentMethod) : room.guest.paymentMethod;
    const isDivisa = ['Efectivo $'].includes(method); 
    const igtf = isDivisa ? (subtotal + inatur) * 0.03 : 0;
    
    let paypalFee = 0;
    if (method === 'PayPal') {
      const net = subtotal + inatur;
      const gross = (net + 0.30) / (1 - 0.054);
      paypalFee = gross - net;
    }

    return {
      subtotal,
      inatur,
      igtf,
      paypalFee,
      total: subtotal + inatur + igtf + paypalFee,
      nights
    };
  }

  showModal(room) {
    this.selectedRoom = room;
    this.switchTab('general');
    document.getElementById('modal-room-number').textContent = `Habitación ${room.number}`;
    document.getElementById('modal-room-type').textContent = `${room.type} - Piso ${room.floor}`;
    const badge = document.getElementById('modal-status-badge');
    const meta = { available: { color: 'bg-green-500', label: 'Libre' }, occupied: { color: 'bg-red-500', label: 'Ocupada' }, cleaning: { color: 'bg-yellow-500', label: 'Limpieza' }, maintenance: { color: 'bg-slate-500', label: 'Mantenimiento' } }[room.status];
    badge.className = `px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${meta.color} text-white`;
    badge.textContent = meta.label;
    document.getElementById('room-status').value = room.status;
    const rateInput = document.getElementById('room-rate');
    rateInput.value = room.rate;
    rateInput.readOnly = this.currentUser.role !== 'admin';
    rateInput.classList.toggle('bg-slate-200', this.currentUser.role !== 'admin');
    const isAvail = room.status !== 'occupied';
    document.getElementById('guest-name').value = isAvail ? '' : room.guest.name;
    document.getElementById('guest-id').value = isAvail ? '' : room.guest.id;
    document.getElementById('reg-payment-method').value = isAvail ? 'Pendiente' : (room.guest.paymentMethod || 'Pendiente');
    document.getElementById('reg-payment-status').value = isAvail ? 'pending' : (room.guest.paymentStatus || 'pending');
    
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(now - tzOffset)).toISOString().slice(0, 16);
    document.getElementById('check-in-time').value = isAvail ? localISOTime : (room.checkIn || localISOTime);
    
    document.getElementById('check-out-time').value = isAvail ? '' : room.checkOut;
    document.getElementById('room-notes').value = isAvail ? '' : room.notes;
    
    const isAvailable = room.status === 'available';
    const btn = document.getElementById('btn-main-action');
    if (!isAvailable) {
      btn.textContent = 'Guardar Cambios';
      btn.classList.remove('bg-green-600'); btn.classList.add('bg-blue-600');
    } else {
      btn.textContent = 'Alquilar Habitación';
      btn.classList.remove('bg-blue-600'); btn.classList.add('bg-green-600');
    }
    document.getElementById('room-modal').classList.remove('hidden');
  }

  hideModal() { document.getElementById('room-modal').classList.add('hidden'); }

  async saveRoomDetails() {
    const room = this.rooms.find(r => r.id === this.selectedRoom.id);
    const oldStatus = room.status;
    let newStatus = document.getElementById('room-status').value;
    const btnText = document.getElementById('btn-main-action').textContent;

    if (oldStatus === 'available' && btnText === 'Alquilar Habitación') newStatus = 'occupied';

    const updatedData = {
      id: room.id,
      status: newStatus,
      rate: parseFloat(document.getElementById('room-rate').value),
      notes: sanitize(document.getElementById('room-notes').value),
      checkIn: document.getElementById('check-in-time').value || (newStatus === 'occupied' ? new Date().toISOString().slice(0, 16) : ''),
      checkOut: document.getElementById('check-out-time').value,
      guest: {
        name: sanitize(document.getElementById('guest-name').value),
        id: sanitize(document.getElementById('guest-id').value),
        paymentMethod: document.getElementById('reg-payment-method').value,
        paymentStatus: document.getElementById('reg-payment-status').value
      }
    };

    try {
      const res = await fetch(`${API_URL}?action=save_room`, {
        method: 'POST',
        body: JSON.stringify(updatedData)
      });
      const result = await res.json();
      if (result.success) {
        this.logAction('Gestión Habitación', `Hab #${room.number}: ${oldStatus} -> ${newStatus}`);
        this.loadData(); // Recargar desde SQL
        this.hideModal();
      }
    } catch (e) { alert("Error guardando en SQL"); }
  }

  async addNewCharge() {
    const descEl = document.getElementById('new-charge-desc');
    const amountEl = document.getElementById('new-charge-amount');
    if (descEl.value && amountEl.value && !isNaN(amountEl.value)) {
      try {
        const res = await fetch(`${API_URL}?action=add_charge`, {
          method: 'POST',
          body: JSON.stringify({ room_id: this.selectedRoom.id, description: sanitize(descEl.value), amount: parseFloat(amountEl.value) })
        });
        if ((await res.json()).success) {
          this.loadData();
          descEl.value = ''; amountEl.value = '';
          setTimeout(() => this.updateBillingView(), 300);
        }
      } catch (e) { alert("Error en SQL"); }
    }
  }

  async deleteCharge(id) {
    try {
      const res = await fetch(`${API_URL}?action=delete_charge&id=${id}`);
      if ((await res.json()).success) {
        this.loadData();
        setTimeout(() => this.updateBillingView(), 300);
      }
    } catch (e) { alert("Error en SQL"); }
  }

  updateBillingView() {
    const list = document.getElementById('charges-list');
    list.innerHTML = this.selectedRoom.charges.length ? '' : '<p class="text-center text-slate-400 py-6 text-xs italic">Sin cargos registrados</p>';
    this.selectedRoom.charges.forEach(c => {
      const div = document.createElement('div'); div.className = 'flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-2';
      div.innerHTML = `<div><p class="font-bold text-slate-800">${c.description}</p><p class="text-[9px] text-slate-400">${c.date}</p></div><div class="flex items-center gap-4"><p class="font-black text-brand-primary">$${c.amount.toFixed(2)}</p><button type="button" class="btn-delete-charge text-slate-300 hover:text-red-500 transition-colors" data-id="${c.id}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div>`;
      list.appendChild(div);
    });

    const { subtotal, inatur, igtf, paypalFee, total, nights } = this.calculateTotal(this.selectedRoom);

    document.getElementById('billing-nights').textContent = nights;
    document.getElementById('billing-subtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('billing-inatur').textContent = `$${inatur.toFixed(2)}`;
    document.getElementById('billing-igtf').textContent = `$${igtf.toFixed(2)}`;
    
    let paypalRow = document.getElementById('billing-paypal-row');
    if (!paypalRow) {
      paypalRow = document.createElement('div');
      paypalRow.id = 'billing-paypal-row';
      paypalRow.className = 'flex justify-between text-[10px] font-bold text-sky-600 uppercase tracking-widest';
      paypalRow.innerHTML = `<span>Comisión PayPal</span><span id="billing-paypal-fee">$0.00</span>`;
      document.getElementById('billing-igtf').parentElement.insertBefore(paypalRow, document.getElementById('billing-igtf').nextSibling);
    }
    paypalRow.classList.toggle('hidden', paypalFee === 0);
    document.getElementById('billing-paypal-fee').textContent = `$${paypalFee.toFixed(2)}`;

    document.getElementById('billing-total').textContent = `$${total.toFixed(2)}`;
    document.getElementById('billing-total-bs').textContent = `Bs. ${(total * this.exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
  }

  printReceipt() {
    const room = this.selectedRoom;
    const { subtotal, inatur, igtf, total, nights } = this.calculateTotal(room);
    const totalBs = total * this.exchangeRate;
    document.getElementById('print-date').textContent = new Date().toLocaleDateString();
    document.getElementById('print-room').textContent = `Habitación: #${room.number}`;
    document.getElementById('print-guest-name').textContent = room.guest.name || 'Huésped General';
    document.getElementById('print-guest-id').textContent = room.guest.id ? `ID: ${room.guest.id}` : 'ID: N/A';
    document.getElementById('print-bcv').textContent = this.exchangeRate.toFixed(2);
    const body = document.getElementById('print-items-body'); body.innerHTML = '';
    
    body.innerHTML = `
      <tr><td style="padding:15px; border-bottom:1px solid #f1f5f9;">Hospedaje (${nights} noches x $${room.rate})</td><td style="padding:15px; border-bottom:1px solid #f1f5f9; text-align:right;">$${(nights * room.rate).toFixed(2)}</td></tr>
    `;
    room.charges.forEach(c => { 
      body.innerHTML += `<tr><td style="padding:15px; border-bottom:1px solid #f1f5f9;">${c.description}</td><td style="padding:15px; border-bottom:1px solid #f1f5f9; text-align:right;">$${Number(c.amount).toFixed(2)}</td></tr>`; 
    });
    body.innerHTML += `
      <tr style="color: #64748b; font-size: 12px;"><td style="padding:10px 15px; text-align:right;">Subtotal:</td><td style="padding:10px 15px; text-align:right;">$${subtotal.toFixed(2)}</td></tr>
      <tr style="color: #64748b; font-size: 12px;"><td style="padding:5px 15px; text-align:right;">Contribución INATUR (1%):</td><td style="padding:5px 15px; text-align:right;">$${inatur.toFixed(2)}</td></tr>
      ${igtf > 0 ? `<tr style="color: #1e3a8a; font-size: 12px; font-weight: bold;"><td style="padding:5px 15px; text-align:right;">IGTF (3%):</td><td style="padding:5px 15px; text-align:right;">$${igtf.toFixed(2)}</td></tr>` : ''}
      ${paypalFee > 0 ? `<tr style="color: #0284c7; font-size: 12px; font-weight: bold;"><td style="padding:5px 15px; text-align:right;">Comisión PayPal:</td><td style="padding:5px 15px; text-align:right;">$${paypalFee.toFixed(2)}</td></tr>` : ''}
    `;

    document.getElementById('print-total').textContent = `$${total.toFixed(2)}`;
    document.getElementById('print-total-bs').textContent = `Bs. ${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
    const div = document.getElementById('print-receipt'); div.classList.remove('hidden'); window.print(); div.classList.add('hidden');
  }

  async processCheckout() {
    const room = this.selectedRoom;
    const { total, igtf, inatur } = this.calculateTotal(room);
    const totalBs = total * this.exchangeRate;
    if (!confirm(`¿Procesar salida? Total: $${total.toFixed(2)} / Bs. ${totalBs.toLocaleString('es-VE')}`)) return;
    
    const checkoutData = {
      room_id: room.id,
      guestName: room.guest.name,
      guestId: room.guest.id,
      total: total,
      totalBs: totalBs,
      method: document.getElementById('payment-method').value,
      igtf: igtf,
      inatur: inatur
    };

    try {
      const res = await fetch(`${API_URL}?action=checkout`, {
        method: 'POST',
        body: JSON.stringify(checkoutData)
      });
      if ((await res.json()).success) {
        this.logAction('Salida Huesped', `Hab #${room.number}: ${room.guest.name}`);
        this.loadData();
        this.hideModal();
      }
    } catch (e) { alert("Error en SQL"); }
  }

  switchTab(t) {
    this.activeTab = t;
    document.querySelectorAll('.modal-tab').forEach(btn => { const active = btn.dataset.tab === t; btn.classList.toggle('border-brand-primary', active); btn.classList.toggle('text-brand-primary', active); btn.classList.toggle('border-transparent', !active); btn.classList.toggle('text-slate-400', !active); });
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('hidden', c.id !== `tab-${t}`));
    if (t === 'billing') this.updateBillingView();
    if (t === 'history') this.updateHistoryView();
  }

  async updateHistoryView() {
    const list = document.getElementById('room-history-list');
    list.innerHTML = '<p class="text-center py-10 text-slate-300">Cargando historial...</p>';
    try {
      const res = await fetch(`${API_URL}?action=get_history&room_id=${this.selectedRoom.id}`);
      const h = await res.json();
      list.innerHTML = h.length ? '' : '<p class="text-center py-10 text-slate-300">Sin historial</p>';
      h.forEach(e => {
        const div = document.createElement('div'); div.className = 'p-4 bg-slate-50 rounded-2xl border border-slate-100 mb-3';
        div.innerHTML = `<div class="flex justify-between items-start mb-2"><div><p class="font-black text-slate-800 text-sm">${sanitize(e.guest_name)} <span class="text-[9px] text-slate-400">(${maskIdCard(e.id_card)})</span></p><p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest">${new Date(e.timestamp).toLocaleString()}</p></div><div class="text-right"><span class="text-[10px] px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg font-black uppercase tracking-tighter">Estadía Finalizada</span></div></div><div class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-yellow-500"></span><p class="text-[10px] font-bold text-slate-500">Estado tras salida: ${e.final_status}</p></div>`;
        list.appendChild(div);
      });
    } catch (e) { list.innerHTML = '<p class="text-center py-10 text-red-400">Error al cargar historial</p>'; }
  }

  async showReports() {
    try {
      const res = await fetch(`${API_URL}?action=get_reports`);
      const r = await res.json();
      document.getElementById('report-today').textContent = `$${parseFloat(r.today).toFixed(2)}`;
      document.getElementById('report-week').textContent = `$${parseFloat(r.week).toFixed(2)}`;
      document.getElementById('report-month').textContent = `$${parseFloat(r.month).toFixed(2)}`;
      
      const body = document.getElementById('report-transactions-body'); body.innerHTML = '';
      r.transactions.forEach(t => body.innerHTML += `<tr class="border-b border-slate-50 hover:bg-slate-50"><td class="px-6 py-4">${new Date(t.timestamp).toLocaleDateString()}</td><td class="px-6 py-4 font-bold">${sanitize(t.guest_name)} <span class="text-slate-400 text-[10px] block">${maskIdCard(t.id_card)}</span></td><td class="px-6 py-4"><span class="text-[9px] font-black bg-slate-100 px-2 py-1 rounded">${t.payment_method}</span></td><td class="px-6 py-4 text-right font-black text-brand-primary">$${parseFloat(t.total_usd).toFixed(2)}</td></tr>`);
      
      // Chart Logic
      const methods = {};
      r.transactions.forEach(t => {
        methods[t.payment_method] = (methods[t.payment_method] || 0) + parseFloat(t.total_usd);
      });
      
      const ctx = document.getElementById('methods-chart');
      if (this.reportsChart) this.reportsChart.destroy();
      
      if (Object.keys(methods).length > 0) {
        this.reportsChart = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: Object.keys(methods),
            datasets: [{
              data: Object.values(methods),
              backgroundColor: ['#1e3a8a', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
              borderWidth: 0
            }]
          },
          options: {
            cutout: '70%',
            plugins: { legend: { display: false } }
          }
        });
      }

      const methodsDiv = document.getElementById('report-methods');
      methodsDiv.innerHTML = '';
      Object.entries(methods).forEach(([method, total], i) => {
        const colors = ['bg-[#1e3a8a]', 'bg-[#10b981]', 'bg-[#f59e0b]', 'bg-[#ef4444]', 'bg-[#8b5cf6]'];
        methodsDiv.innerHTML += `<div class="flex items-center gap-3"><span class="w-3 h-3 rounded-full ${colors[i%colors.length]}"></span><div><p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">${method}</p><p class="text-sm font-black text-slate-800">$${total.toFixed(2)}</p></div></div>`;
      });

      document.getElementById('reports-modal').classList.remove('hidden');
    } catch (e) { alert("Error cargando reportes: " + e.message); }
  }

  async showAuditLogs() { alert("Bitácora se está guardando en SQL (audit_logs)."); }

  switchView(v) {
    if (v === 'inventory' && this.currentUser.role !== 'admin') {
      alert('Acceso denegado. Solo administradores pueden gestionar el inventario.');
      return;
    }

    document.querySelectorAll('.view-container').forEach(el => el.classList.add('hidden'));
    document.getElementById(`view-${v}`).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active', 'bg-blue-800/50', 'text-white'));
    document.getElementById(`nav-${v}`).classList.add('active', 'bg-blue-800/50', 'text-white');
    
    const isHotel = v === 'hotel';
    document.getElementById('floor-nav').classList.toggle('hidden', !isHotel);
    document.getElementById('hotel-control-bar').classList.toggle('hidden', !isHotel);
    document.getElementById('hotel-stats').classList.toggle('hidden', !isHotel);
    document.getElementById('hotel-stats-divider').classList.toggle('hidden', !isHotel);
    
    const titles = {
      'hotel': this.isHousekeepingMode ? `Limpieza - Piso ${this.currentFloor}` : `Piso ${this.currentFloor}`,
      'restaurant': 'Restaurante',
      'events': 'Eventos',
      'inventory': 'Inventario'
    };
    document.getElementById('current-view-title').textContent = titles[v] || 'GestiaNova';
    
    if (v === 'restaurant') this.loadRestaurantData();
    if (v === 'events') this.loadEventsData();
    if (v === 'inventory') this.loadInventoryData();
  }

  async loadRestaurantData() {
    const grid = document.getElementById('restaurant-grid');
    grid.innerHTML = '<p class="text-xs text-slate-400">Cargando mesas...</p>';
    try {
      const res = await fetch(`${API_URL}?action=get_restaurant`);
      const tables = await res.json();
      grid.innerHTML = '';
      tables.forEach(t => {
        const div = document.createElement('div');
        const isOcc = t.status === 'occupied';
        div.className = `p-4 rounded-2xl border-b-4 ${isOcc ? 'bg-white border-red-500 shadow-md' : 'bg-slate-50 border-transparent'} flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-105`;
        div.innerHTML = `
          <span class="text-xs font-black text-slate-800">${t.name}</span>
          <span class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">${t.capacity} Pers.</span>
          ${isOcc ? '<span class="mt-2 w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>' : ''}
        `;
        div.onclick = () => alert(`Gestión de ${t.name} (Próxima actualización)`);
        grid.appendChild(div);
      });
    } catch (e) { console.error(e); }
  }

  async loadEventsData() {
    const list = document.getElementById('events-list');
    list.innerHTML = '<p class="text-xs text-slate-400">Cargando eventos...</p>';
    try {
      const res = await fetch(`${API_URL}?action=get_events`);
      const events = await res.json();
      list.innerHTML = events.length ? '' : '<p class="text-center py-10 text-slate-300 italic">No hay eventos programados</p>';
      events.forEach(e => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-6 bg-slate-50 rounded-2xl border border-slate-100';
        div.innerHTML = `
          <div class="flex gap-4 items-center">
            <div class="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary font-black">
              ${new Date(e.start_time).getDate()}
            </div>
            <div>
              <p class="font-black text-slate-800">${e.title}</p>

              <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">${e.organizer} | ${new Date(e.start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
            </div>
          </div>
          <div class="text-right">
            <span class="text-[10px] px-2 py-1 bg-blue-100 text-blue-600 rounded-lg font-black uppercase tracking-tighter">${e.status}</span>
            <p class="mt-1 text-xs font-black text-slate-800">$${parseFloat(e.total_usd).toFixed(2)}</p>
          </div>
        `;
        list.appendChild(div);
      });
    } catch (e) { console.error(e); }
  }

  async loadInventoryData() {
    const list = document.getElementById('inventory-list');
    list.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-slate-300">Cargando inventario...</td></tr>';
    try {
      const res = await fetch(`${API_URL}?action=get_inventory`);
      const items = await res.json();
      list.innerHTML = items.length ? '' : '<tr><td colspan="5" class="text-center py-10 text-slate-300">Sin items registrados</td></tr>';
      items.forEach(i => {
        const isLow = parseFloat(i.quantity) <= parseFloat(i.min_stock);
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/50 transition-colors';
        tr.innerHTML = `
          <td class="px-8 py-4 font-bold text-slate-800">${i.item_name}</td>
          <td class="px-8 py-4"><span class="text-[9px] font-black uppercase bg-slate-100 px-2 py-1 rounded text-slate-500">${i.category}</span></td>
          <td class="px-8 py-4 font-black text-slate-800">${i.quantity} ${i.unit}</td>
          <td class="px-8 py-4 text-slate-400 font-bold">${i.min_stock}</td>
          <td class="px-8 py-4">
            <span class="text-[9px] font-black uppercase px-2 py-1 rounded ${isLow ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'}">
              ${isLow ? 'Stock Bajo' : 'Normal'}
            </span>
          </td>
        `;
        list.appendChild(tr);
      });
    } catch (e) { console.error(e); }
  }
}

new HotelSystem();


