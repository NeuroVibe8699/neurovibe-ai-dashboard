const API = '';
let token = localStorage.getItem('nv_token');
let currentUser = JSON.parse(localStorage.getItem('nv_user') || 'null');
let gateways = [], nodes = [], sites = [],
