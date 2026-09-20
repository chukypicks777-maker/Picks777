import { SOCIAL_LINKS } from '../../src/constants/socials.js';

export const defaultSeedData = {
  codes: [
    {
      code: 'VIP-PREMIUM-777',
      durationDays: 30,
      label: 'Membresía Especial VIP 777',
      createdAt: '2026-09-13T16:35:37.758Z',
      isClaimed: true,
      claimedAt: '2026-09-13T16:35:37.758Z',
      expiresAt: '2026-10-13T16:35:37.758Z',
      devices: ['da8f2ed1-a24b-4512-8bbb-5dec64d85604'],
      claimedBy: 'vipuser@gmail.com'
    },
    {
      code: 'VIP-2F814A13DC50450C',
      durationDays: 30,
      label: 'Lote VIP',
      createdAt: '2026-09-12T04:51:32.208Z',
      isClaimed: true,
      claimedAt: '2026-09-12T04:51:37.696Z',
      expiresAt: '2026-10-12T04:51:37.696Z',
      devices: ['e3c4ebfb-3ce5-4f4d-842a-719cad8259e7'],
      claimedBy: 'CarlosApostador'
    },
    {
      code: 'VIP-0CA8805F30D56F34',
      durationDays: 30,
      label: 'Lote VIP',
      createdAt: '2026-09-12T04:51:32.208Z',
      isClaimed: true,
      claimedAt: '2026-09-12T04:51:43.900Z',
      expiresAt: '2026-10-12T04:51:43.900Z',
      devices: ['d321189e-6dd5-4c7a-959c-04dcb9ff7931'],
      claimedBy: 'TesterAI'
    },
    {
      code: 'VIP-94F97027D1AF062D',
      durationDays: 30,
      label: 'Lote VIP',
      createdAt: '2026-09-12T04:51:32.208Z',
      isClaimed: false,
      claimedAt: null,
      expiresAt: null,
      devices: []
    },
    {
      code: 'VIP-0E1D53B2CD49C753',
      durationDays: 30,
      label: 'Lote VIP',
      createdAt: '2026-09-12T04:51:32.208Z',
      isClaimed: false,
      claimedAt: null,
      expiresAt: null,
      devices: []
    },
    {
      code: 'VIP-DA44144C0C5BFA89',
      durationDays: 30,
      label: 'Lote VIP',
      createdAt: '2026-09-12T04:51:32.209Z',
      isClaimed: false,
      claimedAt: null,
      expiresAt: null,
      devices: []
    },
    {
      code: 'VIP-981800463AEAED76',
      durationDays: 30,
      label: 'Lote VIP',
      createdAt: '2026-09-12T04:48:25.487Z',
      isClaimed: true,
      claimedAt: '2026-09-12T04:48:25.495Z',
      expiresAt: '2026-10-12T04:48:25.495Z',
      devices: ['fce83de6-76a5-49f3-b755-4899d767ee4f'],
      claimedBy: 'JuanPerez'
    },
    {
      code: 'VIP-9B4A97C2BE261185',
      durationDays: 30,
      label: 'Lote VIP',
      createdAt: '2026-09-12T04:48:25.488Z',
      isClaimed: false,
      claimedAt: null,
      expiresAt: null,
      devices: []
    },
    {
      code: 'VIP-0B9D81471E9A3177',
      durationDays: 30,
      label: 'Lote VIP',
      createdAt: '2026-09-12T04:48:25.488Z',
      isClaimed: false,
      claimedAt: null,
      expiresAt: null,
      devices: []
    },
    {
      code: 'VIP-F86D660A5C54A098',
      durationDays: 30,
      label: 'Lote VIP',
      createdAt: '2026-09-12T04:35:23.688Z',
      isClaimed: true,
      claimedAt: '2026-09-12T04:35:23.697Z',
      expiresAt: '2026-10-12T04:35:23.697Z',
      devices: ['35476204-a369-4b1f-ae03-a5f90f84d707'],
      claimedBy: 'VIPUser'
    },
    {
      code: 'VIP-AD781A9A27E2CFE2',
      durationDays: 30,
      label: 'Lote VIP',
      createdAt: '2026-09-12T04:35:23.688Z',
      isClaimed: false,
      claimedAt: null,
      expiresAt: null,
      devices: []
    },
    {
      code: 'VIP-9E88EE0D25649F76',
      durationDays: 30,
      label: 'Lote VIP',
      createdAt: '2026-09-12T04:35:23.688Z',
      isClaimed: false,
      claimedAt: null,
      expiresAt: null,
      devices: []
    },
    {
      code: 'VIP-EC2D7D066DC08288',
      durationDays: 30,
      label: 'Lote VIP',
      createdAt: '2026-09-12T04:35:23.688Z',
      isClaimed: false,
      claimedAt: null,
      expiresAt: null,
      devices: []
    },
    {
      code: 'VIP-D41631035E1D495D',
      durationDays: 30,
      label: 'Lote VIP',
      createdAt: '2026-09-12T04:35:23.688Z',
      isClaimed: false,
      claimedAt: null,
      expiresAt: null,
      devices: []
    }
  ],
  users: [
    {
      id: 'a13b2054-4845-4cea-9cc9-1ad4798004af',
      googleId: 'e170a95f-3fbb-438b-85f2-74550ffa82a5',
      email: 'vipuser@gmail.com',
      name: 'VIP Tester',
      picture: '',
      createdAt: '2026-09-13T16:35:37.726Z',
      trialExpiresAt: '2026-09-16T16:35:37.726Z',
      vipCode: 'VIP-PREMIUM-777',
      vipExpiresAt: '2026-10-13T16:35:37.758Z',
      role: 'vip',
      devices: ['da8f2ed1-a24b-4512-8bbb-5dec64d85604']
    },
    {
      id: '420a41ba-8022-4f7b-97de-b382f3eafe37',
      googleId: 'b4ae7bbf-d7f1-4317-ba80-85fd6777b612',
      email: 'owner.test@gmail.com',
      name: 'Owner Tester',
      picture: '',
      createdAt: '2026-09-13T16:34:58.800Z',
      trialExpiresAt: '2026-09-16T16:34:58.800Z',
      vipCode: 'MASTER',
      vipExpiresAt: '2027-09-13T16:34:58.824Z',
      role: 'owner',
      devices: ['8e3759b6-8f65-4c32-ad53-b2ff238facd7']
    },
    {
      id: '87906ab2-2828-4e34-a7e2-5473af56c119',
      googleId: 'f94b76df-0a2d-49f9-a3b6-bd9562278040',
      email: 'mi_cuenta@gmail.com',
      name: 'Roberto Google User',
      picture: '',
      createdAt: '2026-09-13T16:34:46.269Z',
      trialExpiresAt: '2026-09-16T16:34:46.269Z',
      vipCode: null,
      vipExpiresAt: null,
      role: 'trial',
      devices: ['f0d26a86-ee2f-4ddf-9ea7-282883c72733']
    },
    {
      id: 'd8ca4715-02b0-487f-864b-6dc2d8338195',
      googleId: 'b07e9644-964b-414d-beea-ad04261b6743',
      email: 'test@gmail.com',
      name: 'Test',
      picture: '',
      createdAt: '2026-09-13T16:29:08.497Z',
      trialExpiresAt: '2026-09-16T16:29:08.497Z',
      vipCode: null,
      vipExpiresAt: null,
      role: 'trial',
      devices: ['c477a616-0480-4f07-b4c7-e278af3d1642']
    }
  ],
  aiConfig: {
    provider: 'custom',
    apiKey: '',
    baseUrl: 'https://vyceai.com/v1',
    selectedModel: 'deepseek-v4.1',
    modelName: 'DeepSeek V4.1 Flash',
    updatedAt: '2026-09-20T00:00:00.000Z'
  },
  socialSettings: {
    links: SOCIAL_LINKS,
    revision: 0,
    updatedAt: null
  }
};
