## Para executar
Usar vagrantfile que foi fornecido..pode ser modificado para instalar sdk da google cloud e todas as dependencias
fazer gcloud init (deve incluir sdk no PATH)
copiar chave json para root (~) da VM

fazer:
```
ansible-playbook gke-cluster-create

ansible-playbook airtrail-deploy
```
Entrar na porta que foi aberta para a rede

## A fazer:
1. Separar hard coded passwords,url,user etc para vaults
2. Separar também para usar config maps
3. Testar
