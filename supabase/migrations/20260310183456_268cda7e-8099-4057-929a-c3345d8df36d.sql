
-- Clean Slate: Remove all auth.users except global@tatame.pro
DELETE FROM auth.sessions WHERE user_id != 'd26454f2-a66d-423f-ae5f-006f1cc90635';
DELETE FROM auth.mfa_factors WHERE user_id != 'd26454f2-a66d-423f-ae5f-006f1cc90635';
DELETE FROM auth.identities WHERE user_id != 'd26454f2-a66d-423f-ae5f-006f1cc90635';
DELETE FROM auth.users WHERE id != 'd26454f2-a66d-423f-ae5f-006f1cc90635';
