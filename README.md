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

## Para testar checkpoint2:
1. Fazer ansible-playbook gke-cluster-create.yml no nosso proprio projeto
2. Ter o codebase disponibilizado pelos docentes
3. ./checkpoint.sh -i ~/ProjetoASCN/codebase/ -o . -c 2 # Replace ProjetoASCN..info: codebase dos docentes está na raiz da máquina e o script também
## A fazer:
1. Separar hard coded passwords,url,user etc para vaults
2. Separar também para usar config maps
3. Testar

ansible [core 2.16.3]
  config file = /home/vagrant/ProjetoASCN/codebase/ansible.cfg
  configured module search path = ['/home/vagrant/.ansible/plugins/modules', '/usr/share/ansible/plugins/modules']
  ansible python module location = /usr/lib/python3/dist-packages/ansible
  ansible collection location = /home/vagrant/.ansible/collections:/usr/share/ansible/collections
  executable location = /usr/bin/ansible
  python version = 3.12.3 (main, Aug 14 2025, 17:47:21) [GCC 13.3.0] (/usr/bin/python3)
  jinja version = 3.1.2
  libyaml = True
