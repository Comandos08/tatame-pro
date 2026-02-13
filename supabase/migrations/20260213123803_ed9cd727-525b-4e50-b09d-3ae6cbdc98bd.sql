
-- Remove auth.users extras, preservando APENAS global@tatame.pro
DELETE FROM auth.users 
WHERE email != 'global@tatame.pro';
